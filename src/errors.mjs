import {ForgeError} from './engine.mjs';
export function isMemoryPressure(error){
  if(['MEMORY','AI_MEMORY'].includes(error?.code))return true;
  if(['QuotaExceededError','NS_ERROR_OUT_OF_MEMORY'].includes(error?.name))return true;
  return /out[ -]of[ -]memory|insufficient memory|memory allocation|allocation (?:failed|failure)|failed to allocate|array buffer allocation|arraybuffer.*allocat|could not create.*texture|texture.*(?:allocat|max_texture_size|too large)|context (?:was )?lost/i.test(String(error?.message||''));
}
export function processingError(error,stage='process'){
  if(error?.name==='AbortError')return error;
  if(typeof error?.code==='string')return error;
  const code=isMemoryPressure(error)?(stage==='ai'?'AI_MEMORY':'MEMORY'):stage==='decode'?'DECODE':'PROCESS';
  const result=new ForgeError(code);result.stage=stage;result.cause=error;return result;
}
