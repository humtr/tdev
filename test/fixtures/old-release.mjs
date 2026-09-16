import fixture from './release-before-migration.json' with {type:'json'};
/** Frozen canonical code is a bootstrap falsifier, never production authority.
 * It runs without Git history, provider access or an installed release.
 * @param {'backend'|'manifest'|'artifacts'} name */
export async function oldReleaseModule(name){
 /** @param {string} selected @returns {string} */
 function url(selected){const source=fixture.files[/** @type {'backend'} */(selected)].replace(/from (['"])([^'"]+)\1/g,(_all,_quote,path)=>{
  const sibling=/^\.\/([a-z-]+)\.mjs$/.exec(path);
  if(sibling&&Object.hasOwn(fixture.files,sibling[1]))return 'from '+JSON.stringify(url(sibling[1]));
  return 'from '+JSON.stringify(path.startsWith('.')?new URL('../../src/release/'+path,import.meta.url).href:path);
 });return 'data:text/javascript;base64,'+Buffer.from(source).toString('base64');}
 return import(url(name));
}
