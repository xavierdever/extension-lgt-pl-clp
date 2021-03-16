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

        // on récupère les prédicats stockés en tant que variable globale dans Utils
        
        const objects_predicatesMap =  Utils.objects_predicates;
        const categories_predicatesMap = Utils.categories_predicates;
        const modules_predicatesMap = Utils.modules_predicates;
        const libraries_predicatesMap = Utils.libraries_predicates;

        // initialisation de la list de CompletionItem
        const itemList = new CompletionList();

        //insertion dans la liste des prédicats des objets puis des catégories
        for(let [key, value] of objects_predicatesMap) {
            for (let i =  0; i < value.length; i++) {
                let item = new CompletionItem(value[i].toString(), CompletionItemKind.Method);
                item.detail = key.toString();
                itemList.items.push(item);
            }
        }

        for(let [key, value] of categories_predicatesMap) {
            for (let i =  0; i < value.length; i++) {
                let item = new CompletionItem(value[i].toString(), CompletionItemKind.Method);
                item.detail = key.toString();
                itemList.items.push(item);            
            }
        }

        for(let [key, value] of modules_predicatesMap) {
            for (let i =  0; i < value.length; i++) {
                let item = new CompletionItem(value[i].toString(), CompletionItemKind.Method);
                item.detail = key.toString();
                itemList.items.push(item);            
            }
        }

        for(let [key, value] of libraries_predicatesMap) {
            for (let i =  0; i < value.length; i++) {
                let item = new CompletionItem(value[i].toString(), CompletionItemKind.Method);
                item.detail = key.toString();
                itemList.items.push(item);            
            }
        }
        return itemList;
    }
}