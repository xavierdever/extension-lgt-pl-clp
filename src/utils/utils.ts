import {
  ExtensionContext,
  Position,
  Range,
  TextDocument,
  workspace,
  window,
  Uri,
  DiagnosticCollection
} from "vscode";

import { basename } from "path";
"use strict";
import * as fs from "fs";
import * as YAML from "yamljs";
import * as cp from "child_process";
import * as jsesc from "jsesc";
import { CompleterResult } from "readline";
import { error } from "util";
import * as path from "path";


interface ISnippet {
  [predIndicator: string]: {
    prefix: string;
    body: string[];
    description: string;
  };
}
interface IPredModule {
  [predicate: string]: string[];
}
export interface IPredicate {
  wholePred: string;
  pi: string;
  functor: string;
  arity: number;
  params: string;
  module: string;
}

export class Utils {
  private static snippets: ISnippet = null;
  private static predModules: IPredModule = null;
  public static DIALECT: string | null = null;
  public static PROLOG_RUNTIMEPATH: string | null = null;
  public static LOGTALK_RUNTIMEPATH: string = "logtalk";
  public static REFMANPATH: string;
  public static CONTEXT: ExtensionContext | null = null;
  public static LINTERTRIGGER: string | null = null;
  public static FORMATENABLED: boolean;
  public static elements_paths: Map<String, String>;
  public static objects_predicates = new Map<String, Array<String>>();
  public static categories_predicates = new Map<String, Array<String>>();

  constructor() { }
  public static getPredDescriptions(pred: string): string {
    if (Utils.snippets[pred]) {
      return Utils.snippets![pred].description;
    }
    return "";
  }

  public static init(context: ExtensionContext) {
    Utils.CONTEXT = context;
    Utils.REFMANPATH = `${process.env.LOGTALKHOME}/manuals/refman/`;
    Utils.elements_paths = new Map<String, String>();
    Utils.objects_predicates = new Map<String, Array<String>>();
    Utils.LOGTALK_RUNTIMEPATH = workspace
      .getConfiguration("logtalk")
      .get<string>("executablePath", "logtalk");
    Utils.prologLoadSnippets(context);
    Utils.logtalkLoadSnippets(context);
    Utils.loadPredicates();
    Utils.genPredicateModules(context);
  }

  public static async loadPredicates() {

    console.log("SALUT");
    const workspaceUri = Uri;
    const uri = window.activeTextEditor.document.uri;
    const files = await workspace.findFiles('**/object/*.lgt');
    const documents = workspace.textDocuments;
    const paths =  new Array<String>();


    let map;
    for (const file of files) {
      paths.push(file.fsPath);
    }
    Utils.getObjectsPredicates(paths);
    Utils.getCategoryPredicates(paths);  
  }

  private static prologLoadSnippets(context: ExtensionContext) {
    if (Utils.snippets) {
      return;
    }
    let snippetsPath = context.extensionPath + "/snippets/prolog.swi.json";
    let snippets = fs.readFileSync(snippetsPath, "utf8").toString();
    let clpsnippetsPath = context.extensionPath + "/snippets/clpfd-snippets.json";
    let clpsnippets = fs.readFileSync(clpsnippetsPath, "utf8").toString();
    Utils.snippets = JSON.parse(snippets);
    Utils.snippets += JSON.parse(clpsnippets);
  }
  private static logtalkLoadSnippets(context: ExtensionContext) {
    if (Utils.snippets) {
      return;
    }
    let snippetsPath = path.join(
      context.extensionPath,
      "/snippets/logtalk.json"
    );
    let snippets = fs.readFileSync(snippetsPath, "utf8").toString();
    Utils.snippets = JSON.parse(snippets);
  }

  public static getSnippetKeys(doc: TextDocument, pred: string): string[] {
    const docTxt = doc.getText();
    let keys: string[] = [];
    const re = new RegExp("^\\w+:" + pred);
    for (let key in Utils.snippets) {
      if (re.test(key)) {
        keys.push(key.replace("/", "_").replace(":", "/"));
      }
    }
    return keys;
  }

  public static getSnippetDescription(
    doc: TextDocument,
    pred: string
  ): string[] {
    const docTxt = doc.getText();
    let descs: string[] = [];
    const re = new RegExp("^\\w+:" + pred);
    for (let key in Utils.snippets) {
      if (re.test(key)) {
        let desc = descs.push(
          Utils.snippets[key].description
            .replace("Description", "")
            .replace("Template and modes", "Template and modes\n")
        );
      }
    }
    return descs;
  }


  private static genPredicateModules(context: ExtensionContext) {
    Utils.prologLoadSnippets(context);
    Utils.predModules = <IPredModule>new Object();
    let pred, mod: string;
    for (let p in Utils.snippets) {
      if (p.indexOf(":") > 0) {
        [mod, pred] = p.split(":");
        if (Utils.predModules[pred]) {
          Utils.predModules[pred] = Utils.predModules[pred].concat(mod);
        } else {
          Utils.predModules[pred] = [mod];
        }
      }
    }
  }

  public static getPredModules(pred1: string): string[] {
    let pred = pred1.indexOf(":") > -1 ? pred1.split(":")[1] : pred1;
    return Utils.predModules[pred] ? Utils.predModules[pred] : [];
  }

  public static getBuiltinNames(): string[] {
    let builtins: string[] = Object.getOwnPropertyNames(Utils.snippets);
    builtins = builtins.filter(name => {
      return !/:/.test(name) && /\//.test(name);
    });
    builtins = builtins.map(name => {
      return name.match(/(.+)\//)[1];
    });
    builtins = builtins.filter((item, index, original) => {
      return !/\W/.test(item) && original.indexOf(item) == index;
    });
    return builtins;
  }

  public static prologGetPredicateUnderCursor(
    doc: TextDocument,
    position: Position
  ): IPredicate {
    let wordRange: Range = doc.getWordRangeAtPosition(position);
    if (!wordRange) {
      return null;
    }

    let predName: string = doc.getText(wordRange);
    let re = new RegExp("^" + predName + "\\s*\\(");
    let re1 = new RegExp("^" + predName + "\\s*\\/\\s*(\\d+)");
    let wholePred: string;
    let arity: number;
    let params: string;
    const docTxt = doc.getText();
    let text = docTxt
      .split("\n")
      .slice(position.line)
      .join("")
      .slice(wordRange.start.character)
      .replace(/\s+/g, " ");

    let module = null;

    if (re.test(text)) {
      let i = text.indexOf("(") + 1;
      let matched = 1;
      while (matched > 0) {
        if (text.charAt(i) === "(") {
          matched++;
          i++;
          continue;
        }
        if (text.charAt(i) === ")") {
          matched--;
          i++;
          continue;
        }
        i++;
      }
      wholePred = text.slice(0, i);
      arity = Utils.getPredicateArity(wholePred);
      params = wholePred.slice(predName.length);

      // find the module if a predicate is picked in :-module or :-use_module
    } else if (re1.test(text)) {
      arity = parseInt(text.match(re1)[1]);
      params =
        arity === 0 ? "" : "(" + new Array(arity).fill("_").join(",") + ")";
      wholePred = predName + params;
      switch (Utils.DIALECT) {
        case "swi":
          let reg = new RegExp(
            "module\\s*\\(\\s*([^,\\(]+)\\s*,\\s*\\[[^\\]]*?" +
            predName +
            "/" +
            arity +
            "\\b"
          );
          let mtch = docTxt.replace(/\n/g, "").match(reg);
          if (mtch) {
            let mFile = jsesc(mtch[1]);
            let mod = Utils.execPrologSync(
              ["-q"],
              `find_module :-
                absolute_file_name(${mFile}, File, [file_type(prolog)]),
                load_files(File),
                source_file_property(File, module(Mod)),
                writeln(module:Mod).`,
              "find_module",
              "true",
              /module:(\w+)/
            );
            if (mod) {
              module = mod[1];
            }
          }
          break;
        case "ecl":
          let modDefMatch = docTxt.match(/\n?\s*:-\s*module\((\w+)\)/);
          let expRe1 = new RegExp(
            "\\n\\s*:-\\s*export[^\\.]+\\b" + predName + "\\s*/\\s*" + arity
          );
          let expRe2 = new RegExp(
            "\\n\\s*:-\\s*import.*\\b" +
            predName +
            "\\s*/\\s*" +
            arity +
            "\\b.*from\\s*(\\w+)"
          );
          let impModMtch = docTxt.match(expRe2);
          if (modDefMatch && expRe1.test(docTxt)) {
            module = modDefMatch[1];
          } else if (impModMtch) {
            module = impModMtch[1];
          }
          break;
        default:
          break;
      }
    } else {
      arity = 0;
      params = "";
      wholePred = predName;
    }

    const fileName = jsesc(window.activeTextEditor.document.fileName);
    if (!module) {
      let modMatch = docTxt
        .slice(0, doc.offsetAt(wordRange.start))
        .match(/([\S]+)\s*:\s*$/);
      if (modMatch) {
        module = modMatch[1];
      } else {
        let mod: string[];
        switch (Utils.DIALECT) {
          case "swi":
            const fm = path.resolve(`${__dirname}/findmodule.pl`);
            mod = Utils.execPrologSync(
              ["-q", fm],
              "",
              `(find_module('${fileName}',
              ${wholePred},
              Module),
              writeln(module:Module))`,
              "true",
              /module:(\w+)/
            );
            break;
          case "ecl":
            let modMtch = docTxt.match(/\n?\s*:-\s*module\((\w+)\)/);
            let currMod: string, clause: string;
            if (modMtch) {
              clause = `find_module :-
                  use_module('${fileName}'),
                  get_flag(${predName}/${arity}, definition_module, Module)@${
                modMtch[1]
                },
                  printf('module:%s%n', [Module])`;
            } else {
              clause = `find_module :-
                  ensure_loaded('${fileName}'),
                  get_flag(${predName}/${arity}, definition_module, Module),
                  printf('module:%s%n', [Module])`;
            }
            mod = Utils.execPrologSync(
              [],
              clause,
              "find_module",
              "true",
              /module:(\w+)/
            );
            break;
          default:
            break;
        }
        if (mod) {
          module = mod[1];
        } else {
          module = null;
        }
      }
    }

    return {
      wholePred: module ? module + ":" + wholePred : wholePred,
      pi: module
        ? module + ":" + predName + "/" + arity
        : predName + "/" + arity,
      functor: predName,
      arity: arity,
      params: params,
      module: module
    };
  }

  public static logtalkGetPredicateUnderCursor(
    doc: TextDocument,
    position: Position
  ): string {
    let wordRange: Range = doc.getWordRangeAtPosition(position);
    if (!wordRange) {
      return null;
    }
    let arity = 0;
    let name = doc.getText(wordRange);
    let re = new RegExp("^" + name + "\\(");
    let re1 = new RegExp("^" + name + "/(\\d+)");
    let doctext = doc.getText();
    let text = doctext
      .split("\n")
      .slice(position.line)
      .join("")
      .slice(wordRange.start.character)
      .replace(/\s+/g, " ");
    if (re.test(text)) {
      let i = text.indexOf("(") + 1;
      let matched = 1;
      while (matched > 0) {
        if (text.charAt(i) === "(") {
          matched++;
          i++;
          continue;
        }
        if (text.charAt(i) === ")") {
          matched--;
          i++;
          continue;
        }
        i++;
      }
      let wholePred = jsesc(text.slice(0, i), { quotes: "double" });

      let pp = cp.spawnSync(Utils.LOGTALK_RUNTIMEPATH, [], {
        cwd: workspace.rootPath,
        encoding: "utf8",
        input: `functor(${wholePred}, N, A), write(name=N;arity=A).`
      });
      if (pp.status === 0) {
        let out = pp.stdout.toString();
        let match = out.match(/name=(\w+);arity=(\d+)/);
        if (match) {
          [name, arity] = [match[1], parseInt(match[2])];
        }
      } else {
        console.log(pp.stderr.toString());
      }
    } else {
      let m = text.match(re1);
      if (m) {
        arity = parseInt(m[1]);
      }
    }
    return name + "/" + arity;
  }

  public static getPredicateArity(pred: string): number {
    let re = /^\w+\((.+)\)$/;
    if (!re.test(pred)) {
      return 0;
    }
    let args = [],
      plCode: string;

    switch (Utils.DIALECT) {
      case "swi":
        args = ["-f", "none", "-q"];
        plCode = `
          outputArity :-
            read(Term),
            functor(Term, _, Arity),
            format("arity=~d~n", [Arity]).
        `;
        break;
      case "ecl":
        plCode = `
          outputArity :-
            read(Term),
            functor(Term, _, Arity),
            printf("arity=%d%n", [Arity]).
        `;

      default:
        break;
    }

    let result = Utils.execPrologSync(
      args,
      plCode,
      "outputArity",
      pred,
      /arity=(\d+)/
    );
    return result ? parseInt(result[1]) : -1;
  }

  public static execPrologSync(
    args: string[],
    clause: string,
    call: string,
    inputTerm: string,
    resultReg: RegExp
  ): string[] {
    let plCode = jsesc(clause, { quotes: "double" });
    let input: string,
      prologProcess: cp.SpawnSyncReturns<Buffer>,
      runOptions: cp.SpawnSyncOptions;
    switch (Utils.DIALECT) {
      case "swi":
        input = `
          open_string("${plCode}", Stream), 
          load_files(runprolog, [stream(Stream)]).
          ${call}. 
          ${inputTerm}.
          halt.
        `;
        runOptions = {
          cwd: workspace.rootPath,
          encoding: "utf8",
          input: input
        };
        prologProcess = cp.spawnSync(Utils.PROLOG_RUNTIMEPATH, args, runOptions);
        break;
      case "ecl":
        input = `${inputTerm}.`;
        args = args.concat([
          "-e",
          `open(string(\"${
          plCode
          }\n\"), read, S),compile(stream(S)),close(S),call(${call}).`
        ]);
        runOptions = {
          cwd: workspace.rootPath,
          encoding: "utf8",
          input: input
        };
        prologProcess = cp.spawnSync(Utils.PROLOG_RUNTIMEPATH, args, runOptions);
        break;
      default:
        break;
    }

    if (prologProcess.status === 0) {
      let output = prologProcess.stdout.toString();
      let err = prologProcess.stderr.toString();
      // console.log("out:" + output);
      // console.log("err:" + err);

      let match = output.match(resultReg);
      return match ? match : null;
    } else {
      console.log("UtilsExecSyncError: " + prologProcess.stderr.toString());
      return null;
    }
  }

  public static insertBuiltinsToSyntaxFile(context: ExtensionContext) {
    let syntaxFile = path.resolve(
      context.extensionPath + "/syntaxes/prolog.tmLanguage.yaml"
    );
    YAML.load(syntaxFile, obj => {
      let builtins: string = Utils.getBuiltinNames().join("|");
      obj.repository.builtin.patterns[1].match = "\\b(" + builtins + ")\\b";
      let newSnippets = YAML.stringify(obj, 5);
      fs.writeFile(syntaxFile, newSnippets, err => {
        return console.error(err);
      });
    });
  }

  public static isValidEclTerm(docText: string, str: string): boolean {
    if (Utils.DIALECT !== "ecl") {
      return false;
    }
    let lm = path.resolve(
      `${Utils.CONTEXT.extensionPath}/out/src/features/load_modules`
    );
    let goals = `
        use_module('${lm}'),
        load_modules_from_text("${docText}"),
        catch((term_string(_, "${str}"), writeln("result:validTerm")),
          _, writeln("result:invalidTerm")).
          `;
    let runOptions = {
      cwd: workspace.rootPath,
      encoding: "utf8",
      input: goals
    };
    let prologProcess = cp.spawnSync(Utils.PROLOG_RUNTIMEPATH, [], runOptions);
    if (prologProcess.status === 0) {
      let output = prologProcess.stdout.toString();
      let err = prologProcess.stderr.toString();
      let match = output.match(/result:validTerm/);
      return match ? true : false;
    } else {
      return false;
    }
  }

  public static getObjectsPredicates(paths : Array<String>) {

    const regex_begin = new RegExp(":- *object\\([^.]*\\).", "g");
    const regex_end = new RegExp(":- * end_object. *", "g");
    const regex_name = new RegExp(/((:-)\s(object))(?:\()([^(,)]+)(\)|,)/g);
    const fs = require("fs");        
    const minifier = require('string-minify');


    for (let k = 0; k < paths.length; k++) {
        let tmp = fs.readFileSync(paths[k]).toString();
        let data = minifier(tmp);
        let objects_begin =  [... data.matchAll(regex_begin)];
        let objects_end = [... data.matchAll(regex_end)];
        // let objects_begin = regex_begin.exec(data);
        // let objects_end = regex_end.exec(data);


        let elements_content = new Map<String, String>();
        
        for (let i = 0; i < objects_begin.length; i++) {
          console.log(paths[k] + "\n");
          console.log("debut : " + objects_begin[i].index);
          let content = data.toString().substring(objects_begin[i].index, objects_end[i].index + objects_end[i][0].length);
          console.log(content.toString());
          console.log("fin : " + (objects_end[i].index + objects_end[i][0].length) + "\n");

          
          let res = [... objects_begin[i].toString().matchAll(regex_name)];
          let name = res[0][4];
          elements_content.set(name, content);  
        }

        elements_content.forEach((value : String, key : String) => {
          // let regex = new RegExp("\\w+\\([\\w\\s,]+\\)\\s*:-[:\\w\\s\\(\\), \\\\=]+\.", "g");
          // let predicates = [... value.toString().matchAll(regex)];
          // let array = Array<String>();

          // predicates.forEach(element => {
          //   array.push(element.toString());
          // });
          // this.objects_predicates.set(key, array);
          let regex = new RegExp("\\w+\\(?[\\w\\s,]+\\)?\\s*:-", "g");
          let predicates_begin = [... value.toString().matchAll(regex)];
          let array = new Array<String>();

          for (let i = 0; i < predicates_begin.length; i++) {
            let str = value.toString().substring(predicates_begin[i].index, value.indexOf(".", predicates_begin[i].index));
            array.push(str);
          }
            this.objects_predicates.set(key, array);
        });
    }
  }

  public static getCategoryPredicates(paths : Array<String>) {
    const regex_begin = new RegExp(":- *category\\([^.]*\\).", "g");
    const regex_end = new RegExp(":- * end_category. *", "g");
    const regex_name = new RegExp(/((:-)\s(category))(?:\()([^(,)]+)(\)|,)/g);
    const fs = require("fs");        
    const minifier = require('string-minify');


    for (let k = 0; k < paths.length; k++) {
        let tmp = fs.readFileSync(paths[k]).toString();
        let data = minifier(tmp.toString());
        let categ_begin =  [... data.matchAll(regex_begin)];
        let categ_end = [... data.matchAll(regex_end)];
        // let objects_begin = regex_begin.exec(data);
        // let objects_end = regex_end.exec(data);


        let elements_content = new Map<String, String>();
        
        for (let i = 0; i < categ_begin.length; i++) {
          console.log(paths[k] + "\n");
          console.log("debut : " + categ_begin[i].index);
          let content = data.toString().substring(categ_begin[i].index, categ_end[i].index + categ_end[i][0].length);
          console.log(content.toString());
          console.log("fin : " + (categ_end[i].index + categ_end[i][0].length) + "\n");

          
          let res = [... categ_begin[i].toString().matchAll(regex_name)];
          let name = res[0][4];
          elements_content.set(name, content);  
        }

        elements_content.forEach((value : String, key : String) => {
          let regex = new RegExp("\\w+\\(?[\\w\\s,]+\\)?\\s*:-", "g");
          let predicates_begin = [... value.toString().matchAll(regex)];
          let array = new Array<String>();

          for (let i = 0; i < predicates_begin.length; i++) {
            let str = value.toString().substring(predicates_begin[i].index, value.indexOf(".", predicates_begin[i].index));
            array.push(str);
          }
            this.categories_predicates.set(key, array);
        });
    }
  }
}
