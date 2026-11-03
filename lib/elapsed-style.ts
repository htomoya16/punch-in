import type {Category,Session} from './model';
import {members} from './work';
import {readableColor} from './time';
export function elapsedColors(session:Session|undefined,categories:Category[]){
 if(!session)return [];
 return members(session).filter(m=>m.state==='active').map(m=>readableColor(categories.find(c=>c.id===m.categoryId)?.color??'#64748b'));
}
export function diagonalColors(colors:string[]){return colors.length>1?`linear-gradient(135deg, ${colors.flatMap((color,i)=>[`${color} ${i/colors.length*100}%`,`${color} ${(i+1)/colors.length*100}%`]).join(', ')})`:undefined;}
