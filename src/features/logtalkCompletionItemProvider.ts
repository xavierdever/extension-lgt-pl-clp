import { CancellationToken, CompletionItem, CompletionItemKind, CompletionItemProvider, CompletionList, Position, ProviderResult, TextDocument } from "vscode";
import { Utils } from "../utils/utils";

export default class LogtalkCompletionItemProvider
    implements CompletionItemProvider {
    provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<CompletionItem[] | CompletionList> {
        // pour le document de 0 a position -> récupérer le contenu
        // extraire les extends
        // aller récupérer pour chaque objet extend les prédicats
        // pour chaque prédicats, creer completion item
        // ajouter les completion item à la completion list

        console.log('test1');

        
        const objects_predicatesMap =  Utils.objects_predicates;
        const categories_predicatesMap = Utils.categories_predicates;

        const itemList = new CompletionList();

        for(let [key, value] of objects_predicatesMap) {
            for (let i =  0; i < value.length; i++) {
                itemList.items.push(new CompletionItem(value[i].toString(), CompletionItemKind.Method));
            }
        }

        for(let [key, value] of categories_predicatesMap) {
            for (let i =  0; i < value.length; i++) {
                itemList.items.push(new CompletionItem(value[i].toString(), CompletionItemKind.Interface));
            }
        }
        return itemList;
    }
   
     
    }