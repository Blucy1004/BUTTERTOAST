'use strict';
(() => {
  const values={theme:['dark','light','system'],accent:['blue','violet','rose','teal','amber'],background:['theme','dawn','stars','plain'],textSize:['small','default','large'],density:['comfortable','compact'],corners:['soft','rounded','square'],motion:['system','reduced']};
  const defaults={theme:'dark',accent:'blue',background:'theme',textSize:'default',density:'comfortable',corners:'soft',motion:'system'};
  window.renderAppearance=(element,options,resolved)=>{
    for(const [key,allowed] of Object.entries(values))element.dataset[key]=allowed.includes(options?.[key])?options[key]:defaults[key];
    element.dataset.theme=options?.theme==='system'?(resolved==='light'?'light':'dark'):element.dataset.theme;
  };
  window.appearance.onState(state=>{
    window.renderAppearance(document.documentElement,state.options,state.resolved);
    window.dispatchEvent(new CustomEvent('appearance-updated',{detail:{resolved:state.resolved}}));
  });
  window.appearance.ready();
})();
