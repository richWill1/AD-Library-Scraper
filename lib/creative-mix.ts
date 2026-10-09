import type {CreativeMedia} from '@/lib/media';
export type CreativeFormat='Video'|'Image'|'Mixed'|'Unknown';
export function creativeFormat(items:CreativeMedia[]):CreativeFormat{const video=items.some(i=>i.kind==='video'),image=items.some(i=>i.kind==='image');return video&&image?'Mixed':video?'Video':image?'Image':'Unknown';}
export function creativeMix(ads:{id:string;format:string}[]){const unique=[...new Map(ads.map(a=>[a.id,a])).values()];const total=unique.length;const count=(format:string)=>unique.filter(a=>a.format===format).length;const video=count('Video'),image=count('Image'),mixed=count('Mixed'),unknown=total-video-image-mixed;return {total,video,image,mixed,unknown,classified:total-unknown,percent:(n:number)=>total?Math.round(n/total*100):0};}
