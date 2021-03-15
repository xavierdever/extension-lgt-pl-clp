"use strict";
import {
  CommentRule,
  Disposable,
  IndentAction,
  languages,
  OnEnterRule,
  Position,
  Range,
  Selection,
  TextDocument,
  window,
  workspace
} from "vscode";

export function logtalkLoadEditHelpers(subscriptions: Disposable[]) {
  subscriptions.push(
    languages.setLanguageConfiguration("logtalk", {
      indentationRules: {
        decreaseIndentPattern: /(\s*\)|\s*\])$/,
        increaseIndentPattern: /(.*:-\s*|.*->\s*|.+\[|.+\()$/
      },
      wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
      onEnterRules: [
        {
          beforeText: /(^\s*|.*%.+|^\s+.+\.)$/,
          action: { indentAction: IndentAction.None }
        },
        {
          beforeText: /.+:-|:- object.+\.|:- protocol.+\.|:- category.+\.|.+\([^\)]*$/,
          action: { indentAction: IndentAction.Indent }
        },
        {
          beforeText: /(.+\.|[^,;])$/,
          action: { indentAction: IndentAction.Outdent }
        },
        {
          // e.g. /** | */
          beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
          afterText: /^\s*\*\/$/,
          action: {
            indentAction: IndentAction.IndentOutdent,
            appendText: " * "
          }
        },
        {
          // e.g. /** ...|
          beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
          action: { indentAction: IndentAction.None, appendText: " * " }
        },
        {
          // e.g.  * ...|
          beforeText: /^(\t|(\ \ ))*\ \*(\ ([^\*]|\*(?!\/))*)?$/,
          action: { indentAction: IndentAction.None, appendText: "* " }
        },
        {
          // e.g.  */|
          beforeText: /^(\t|(\ \ ))*\ \*\/\s*$/,
          action: { indentAction: IndentAction.None, removeText: 1 }
        },
        {
          // e.g.  *-----*/|
          beforeText: /^(\t|(\ \ ))*\ \*[^/]*\*\/\s*$/,
          action: { indentAction: IndentAction.None, removeText: 1 }
        }
      ]
    })
  );

  function logtalkGetPreviousClauseHead(doc: TextDocument, line: number): string {
    if (line <= 0) {
      return "";
    }
    let txt = doc.lineAt(line).text;
    let regex = new RegExp("^\\s*(.+)(:-|-->)");
    if (regex.test(txt)) {
      return txt.match(regex)[1];
    }

    regex = new RegExp("^\\s*(.+)\\.$");
    if (regex.test(txt)) {
      let i = line - 1;
      while (/^\s*$/.test(doc.lineAt(i).text)) i--;
      if (doc.lineAt(i).text.endsWith(".")) {
        return txt.match(regex)[1];
      }
    }

    return logtalkGetPreviousClauseHead(doc, line - 1);
  }

  function isRecursiveLogtalk(doc: TextDocument, line: number) {
    if (line <= 0) {
      return false;
    }
    let i = line - 1;
    while (/^\s*$/.test(doc.lineAt(i).text)) i--;
    return /,$|:-$/.test(doc.lineAt(i).text) ? true : false;
  }

  function nextRecursiceParamsLogtalk(
    doc: TextDocument,
    line: number,
    originalHead: string
  ): string {
    if (!/\(/.test(originalHead)) {
      return originalHead;
    }
    let regex = new RegExp("([^(]+)\\((.+)\\)\\s*$");
    let match = originalHead.match(regex);
    let origList = match[2].split(",");
    let newList = origList.map(param => {
      let param1 = param.trim();
      let match = param1.match(/^\[.+\|(.+)\]$/);
      if (match) {
        return match[1];
      } else if (/^[A-Z]/.test(param1)) {
        let i = line;
        while (!/:-/.test(doc.lineAt(i).text)) {
          let match = doc
            .lineAt(i)
            .text.match("^\\s*(\\w+)\\s+is\\s+.*\\b" + param1 + "\\b");
          if (match) {
            return match[1];
          } else {
            i--;
          }
        }
        return param1;
      } else return param1;
    });
    return match[1] + "(" + newList.join(", ") + ")";
  }
  workspace.onDidChangeTextDocument(
    e => {
      let lastChange = e.contentChanges[0];
      let lastChar = lastChange.text;
      let range = lastChange.range;
      let start = range.start;
      let line = start.line;
      let col = start.character;
      let editor = window.activeTextEditor;
      let lineTxt = e.document.lineAt(line).text;
      if (lastChar === "_") {
        let before = lineTxt.substring(0, col);
        let after = lineTxt.substring(col + 1);
        if (
          before.lastIndexOf(")") < before.lastIndexOf("(") &&
          /\W$/.test(before) &&
          /^\w/.test(after)
        ) {
          let varLength = after.match("^(\\w+)\\b")[1].length;
          editor.edit(edit => {
            edit.delete(
              new Range(
                new Position(line, col + 1),
                new Position(line, col + varLength + 1)
              )
            );
          });
        }
      } else if (/^\s*\.$/.test(lineTxt)) {
        let prevHead: string = logtalkGetPreviousClauseHead(e.document, line - 1);
        if (isRecursiveLogtalk(e.document, line)) {
          prevHead = nextRecursiceParamsLogtalk(e.document, line - 1, prevHead);
        }
        editor
          .edit(edit => {
            edit.replace(
              new Range(start, new Position(line, col + 1)),
              prevHead
            );
          })
          .then(() => {
            let loc = prevHead.indexOf("(");
            loc = loc > -1 ? loc + 1 : prevHead.length - 1;
            let end = new Position(line, col + loc);
            editor.selection = new Selection(end, end);
          });
      } else {
        return;
      }
    },
    null,
    subscriptions
  );
}
