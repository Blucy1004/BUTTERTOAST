import {exactKeys,record} from '../security/ipc';
import type {Usage} from './protocol';
export type ModelOptions = {maxOutput:number; reasoning:'default'|'low'|'medium'|'high'; contextLimit:number; inputPrice:number; cachedPrice:number; outputPrice:number; budget:number};
export const defaultOptions: ModelOptions = {maxOutput:2048,reasoning:'default',contextLimit:0,inputPrice:0,cachedPrice:0,outputPrice:0,budget:0};
export function parseOptions(v:unknown): ModelOptions|null {
  if(!record(v)||!exactKeys(v,['maxOutput','reasoning','contextLimit','inputPrice','cachedPrice','outputPrice','budget'])
    ||!Number.isSafeInteger(v.maxOutput)||(v.maxOutput as number)<128||(v.maxOutput as number)>8192
    ||!['default','low','medium','high'].includes(v.reasoning as string)||!Number.isSafeInteger(v.contextLimit)||(v.contextLimit as number)<0||(v.contextLimit as number)>2_000_000
    ||!['inputPrice','cachedPrice','outputPrice','budget'].every(k=>typeof v[k]==='number'&&Number.isFinite(v[k])&&(v[k] as number)>=0&&(v[k] as number)<=10000))return null;
  return {...v} as ModelOptions;
}
export function estimatedCost(usage:Usage,options:ModelOptions):number {
  return (Math.max(0,usage.input-usage.cached)*options.inputPrice+Math.min(usage.input,usage.cached)*options.cachedPrice+usage.output*options.outputPrice)/1_000_000;
}
