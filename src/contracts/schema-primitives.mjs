/** Exact decimal uint64 JSON Schema pattern, including the public revision bound.
 * No custom validator keyword is needed by MCP clients or ahead-of-time edge code.
 */
const maximum='18446744073709551615';
const alternatives=['0','[1-9][0-9]{0,18}'];
for(let i=1;i<maximum.length;i++){
 const digit=Number(maximum[i]);if(digit===0)continue;
 const lower=digit===1?'0':`[0-${digit-1}]`;
 const remaining=maximum.length-i-1;
 alternatives.push(maximum.slice(0,i)+lower+(remaining===0?'':`[0-9]{${remaining}}`));
}
alternatives.push(maximum);
export const UINT64_PATTERN='^(?:'+alternatives.join('|')+')$';
