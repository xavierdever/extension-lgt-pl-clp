"use strict";
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {
  commands,
  DocumentFilter,
  ExtensionContext,
  Terminal,
  TextDocument,
  window,
  languages,
  DocumentHighlightProvider,
  Location,
  workspace
} from "vscode";
import * as path from "path";
import PrologTerminal from "./features/prologTerminal";
import { prologLoadEditHelpers } from "./features/prologEditHelpers";
import { Utils } from "./utils/utils";
import PrologHoverProvider from "./features/prologHoverProvider";
import PrologDocumentHighlightProvider from "./features/prologDocumentHighlightProvider";
import PrologDocumentFormatter from "./features/prologFormattingEditProvider";
import { PrologDefinitionProvider } from "./features/prologDefinitionProvider";
import { PrologReferenceProvider } from "./features/prologReferenceProvider";
import PrologLinter from "./features/prologLinter";
import { logtalkLoadEditHelpers } from "./features/logtalkEditHelpers";
import LogtalkDocumentHighlightProvider from "./features/logtalkDocumentHighlightProvider";
import LogtalkTerminal from "./features/logtalkTerminal";
import LogtalkLinter from "./features/logtalkLinter";
import LogtalkHoverProvider from "./features/logtalkHoverProvider";
import LogtalkCompletionItemProvider from "./features/logtalkCompletionItemProvider";
import { PrologRefactor } from "./features/prologRefactor";
import { ensureSymlink, remove } from "fs-extra-plus";
import * as jsesc from "jsesc";
import * as fs from "fs";

async function initForDialect(context: ExtensionContext) {
  console.log("SALUT");

  const section = workspace.getConfiguration("prolog");
  const dialect = section.get<string>("dialect");
  const exec = section.get<string>("executablePath", "swipl");
  Utils.LINTERTRIGGER = section.get<string>("linter.run");
  Utils.FORMATENABLED = section.get<boolean>("format.enabled");

  Utils.DIALECT = dialect;
  Utils.PROLOG_RUNTIMEPATH = jsesc(exec);
  const exPath = jsesc(context.extensionPath);
  const diaFile = path.resolve(`${exPath}/.vscode`) + "/dialect.json";
  const lastDialect = JSON.parse(fs.readFileSync(diaFile).toString()).dialect;
  if (lastDialect === dialect) {
    return;
  }

  const symLinks = [
    {
      path: path.resolve(`${exPath}/syntaxes`),
      srcFile: `prolog.${dialect}.tmLanguage.json`,
      targetFile: "prolog.tmLanguage.json"
    },
    {
      path: path.resolve(`${exPath}/snippets`),
      srcFile: `prolog.${dialect}.json`,
      targetFile: "prolog.json"
    }
  ];
  await Promise.all(
    symLinks.map(async link => {
      await remove(path.resolve(`${link.path}/${link.targetFile}`));
      try {
        return await ensureSymlink(
          path.resolve(`${link.path}/${link.srcFile}`),
          path.resolve(`${link.path}/${link.targetFile}`)
        );
      } catch (err) {
        window.showErrorMessage("VSC-Prolog failed in initialization. Try to run vscode in administrator role.");
        throw (err);
      }
    })
  );
  fs.writeFileSync(diaFile, JSON.stringify({ dialect: dialect }));
}
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: ExtensionContext) {
  console.log("SALUT");

  console.log('Congratulations, your extension "vsc-prolog" is now active!');

  await initForDialect(context);

  const PROLOG_MODE: DocumentFilter = { language: "prolog", scheme: "file" };
  const LOGTALK_MODE: DocumentFilter = { language: "logtalk", scheme: "file" };

  Utils.init(context);
  const logtalkLinter = new LogtalkLinter(context);
  logtalkLinter.activate();
  prologLoadEditHelpers(context.subscriptions);
  logtalkLoadEditHelpers(context.subscriptions);


  let myCommands = [
    {
      command: "prolog.load.document",
      callback: () => {
        PrologTerminal.loadDocument();
      }
    },
    {
      command: "prolog.query.goal",
      callback: () => {
        PrologTerminal.queryGoalUnderCursor();
      }
    },
    {
      command: "prolog.refactorPredicate",
      callback: () => {
        new PrologRefactor().refactorPredUnderCursor();
      }
    },
    {
      command: "logtalk.linter.nextErrLine",
      callback: () => {
        logtalkLinter.nextErrLine();
      }
    },
    {
      command: "logtalk.linter.prevErrLine",
      callback: () => {
        logtalkLinter.prevErrLine();
      }
    },
    {
      command: "logtalk.load.document",
      callback: uri => {
        LogtalkTerminal.loadDocument(uri);
      }
    },
    {
      command: "logtalk.run.tests",
      callback: uri => {
        LogtalkTerminal.runTests(uri);
      }
    },
    {
      command: "logtalk.run.doclet",
      callback: uri => {
        LogtalkTerminal.runDoclet(uri);
      }
    },
    {
      command: "logtalk.scan.deadCode",
      callback: uri => {
        LogtalkTerminal.scanForDeadCode(uri);
      }
    },
    {
      command: "logtalk.generate.documentation",
      callback: uri => {
        LogtalkTerminal.genDocumentation(uri);
      }
    },
    {
      command: "logtalk.generate.diagrams",
      callback: uri => {
        LogtalkTerminal.genDiagrams(uri);
      }
    },
    {
      command: "logtalk.open",
      callback: () => {
        LogtalkTerminal.openLogtalk();
      }
    },
    {
      command: "logtalk.run.testers",
      callback: uri => {
        LogtalkTerminal.runTesters();
      }
    },
    {
      command: "logtalk.run.doclets",
      callback: uri => {
        LogtalkTerminal.runDoclets();
      }
    }
  ];

  let prologLinter: PrologLinter;
  if (Utils.LINTERTRIGGER !== "never") {
    prologLinter = new PrologLinter(context);
    prologLinter.activate();
    myCommands = myCommands.concat([
      {
        command: "prolog.linter.nextErrLine",
        callback: () => {
          prologLinter.nextErrLine();
        }
      },
      {
        command: "prolog.linter.prevErrLine",
        callback: () => {
          prologLinter.prevErrLine();
        }
      }
    ]);
  }

  myCommands.map(command => {
    context.subscriptions.push(
      commands.registerCommand(command.command, command.callback)
    );
  });

  if (Utils.LINTERTRIGGER !== "never") {
    context.subscriptions.push(
      languages.registerCodeActionsProvider(PROLOG_MODE, prologLinter)
    );
  }
  context.subscriptions.push(
    languages.registerHoverProvider(PROLOG_MODE, new PrologHoverProvider())
  );
  context.subscriptions.push(
    languages.registerDocumentHighlightProvider(
      PROLOG_MODE,
      new PrologDocumentHighlightProvider()
    )
  );
  if (process.platform !== "win32" && Utils.FORMATENABLED) {
    context.subscriptions.push(
      languages.registerDocumentRangeFormattingEditProvider(
        PROLOG_MODE,
        new PrologDocumentFormatter()
      )
    );
    context.subscriptions.push(
      languages.registerOnTypeFormattingEditProvider(
        PROLOG_MODE,
        new PrologDocumentFormatter(),
        ".",
        "\n"
      )
    );
    context.subscriptions.push(
      languages.registerDocumentFormattingEditProvider(
        PROLOG_MODE,
        new PrologDocumentFormatter()
      )
    );
  }
  context.subscriptions.push(
    languages.registerDefinitionProvider(
      PROLOG_MODE,
      new PrologDefinitionProvider()
    )
  );
  context.subscriptions.push(
    languages.registerReferenceProvider(
      PROLOG_MODE,
      new PrologReferenceProvider()
    )
  );
  context.subscriptions.push(PrologTerminal.init());
  context.subscriptions.push(
    languages.registerDocumentHighlightProvider(
      LOGTALK_MODE,
      new LogtalkDocumentHighlightProvider()
    )
  );
  context.subscriptions.push(
    languages.registerHoverProvider(LOGTALK_MODE, new LogtalkHoverProvider())
  );
  
  context.subscriptions.push(LogtalkTerminal.init());

  context.subscriptions.push(languages.registerCompletionItemProvider(LOGTALK_MODE, new LogtalkCompletionItemProvider()));
  // context.subscriptions.push(prologDebugger);
}

// this method is called when your extension is deactivated
export function deactivate() { }
