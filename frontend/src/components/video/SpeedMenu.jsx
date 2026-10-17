import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
const speeds=[0.5,0.75,1,1.25,1.5,1.75,2];
const sizes=[75,100,125,150,200];
const families=[['default','Default'],['sans','Sans serif'],['serif','Serif'],['mono','Monospace']];
const colors=[['#ffffff','White'],['#ffeb3b','Yellow'],['#00ffff','Cyan'],['#000000','Black']];
const opacities=[0,25,50,75,100];
const parent={speed:'settings',captions:'settings',appearance:'captions',size:'appearance',family:'appearance',color:'appearance',opacity:'appearance'};
export default function SpeedMenu({value,onChange,containerRef,onOpenChange,captionsEnabled,onCaptionsChange,captionLanguage='English',audioLanguage='English',captionPreferences,onCaptionPreferencesChange}){
 const {t}=useTranslation(),[open,setOpen]=useState(false),[view,setView]=useState('settings');
 const trigger=useRef(null),menu=useRef(null),id=useId();
 const label=(key,fallback)=>t(key,{defaultValue:fallback});
 const pref=(key,fallback)=>captionPreferences?.[key]??fallback;
 const update=(key,next)=>onCaptionPreferencesChange?.({...captionPreferences,[key]:next});
 const close=(restore=false)=>{setOpen(false);setView('settings');if(restore)trigger.current?.focus()};
 const back=()=>setView(parent[view]||'settings');
 useEffect(()=>onOpenChange?.(open),[open,onOpenChange]);
 useEffect(()=>{if(!open)return;const target=menu.current?.querySelector('[aria-checked="true"]')||menu.current?.querySelector('[role="menuitem"]');target?.focus();const outside=e=>{if(!menu.current?.contains(e.target)&&!trigger.current?.contains(e.target))close()};document.addEventListener('pointerdown',outside,true);return()=>document.removeEventListener('pointerdown',outside,true)},[open,view]);
 const keys=e=>{const items=[...menu.current.querySelectorAll('[role^="menuitem"]')],at=items.indexOf(document.activeElement);if(e.key==='Escape'){e.preventDefault();view==='settings'?close(true):back();return}if(e.key==='Tab'){e.preventDefault();close(true);return}const move={ArrowDown:1,ArrowUp:-1};let next=e.key==='Home'?0:e.key==='End'?items.length-1:undefined;if(e.key in move)next=(at+move[e.key]+items.length)%items.length;if(next!==undefined){e.preventDefault();items[next]?.focus()}};
 const normal=label('learning.player.normal','Normal · 1×');
 const headings={settings:label('learning.player.settings','Settings'),speed:label('learning.player.speed','Playback speed'),captions:label('learning.workspace.captions','Captions'),appearance:'Caption appearance',size:'Font size',family:'Font family',color:'Text color',opacity:'Background opacity'};
 const radio=(key,checked,text,action)=><button key={key} type="button" role="menuitemradio" aria-checked={checked} onClick={action}><span>{text}</span><span className="lw-speed-check" aria-hidden="true">{checked&&<Check size={15}/>}</span></button>;
 const sub=(text,summary,next)=><button type="button" role="menuitem" onClick={()=>setView(next)}><span>{text}</span><span className="lw-settings-value">{summary}<ChevronRight size={15} aria-hidden="true"/></span></button>;
 return <><button ref={trigger} type="button" className="lw-settings-trigger" aria-label={label('learning.player.settings','Settings')} title={label('learning.player.settings','Settings')} aria-haspopup="menu" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>open?close():setOpen(true)} data-shortcuts-ignore><Settings size={20} aria-hidden="true"/></button>{open&&containerRef.current&&createPortal(<div id={id} ref={menu} className="lw-speed-menu" role="menu" aria-label={headings[view]} onKeyDown={keys} data-shortcuts-ignore data-view={view}>
 {view==='settings'?<><div className="lw-speed-heading">{headings.settings}</div>{sub(label('learning.player.speed','Playback speed'),value===1?normal:`${value}×`,'speed')}{sub(label('learning.workspace.captions','Captions'),captionsEnabled?`${captionLanguage} · ${label('learning.player.on','On')}`:label('learning.player.off','Off'),'captions')}<div className="lw-settings-static" role="presentation"><span>{label('learning.player.audio_language','Audio language')}</span><span>{audioLanguage}</span></div></>:<><button type="button" role="menuitem" className="lw-settings-back" onClick={back}><ChevronLeft size={16} aria-hidden="true"/>{headings[view]}</button>
 {view==='speed'&&speeds.map(x=>radio(`speed-${x}`,x===value,x===1?normal:`${x}×`,()=>{onChange(x);close(true)}))}
 {view==='captions'&&<>{radio('captions-off',!captionsEnabled,label('learning.player.off','Off'),()=>onCaptionsChange?.(false))}{radio('captions-language',captionsEnabled,captionLanguage,()=>onCaptionsChange?.(true))}{sub('Caption appearance','', 'appearance')}</>}
 {view==='appearance'&&<>{sub('Font size',`${pref('fontSize',100)}%`,'size')}{sub('Font family',families.find(x=>x[0]===pref('fontFamily','default'))?.[1]||'Default','family')}{sub('Text color',colors.find(x=>x[0]===pref('textColor','#ffffff'))?.[1]||'White','color')}{sub('Background opacity',`${pref('backgroundOpacity',75)}%`,'opacity')}<button type="button" role="menuitem" onClick={()=>onCaptionPreferencesChange?.({fontSize:100,fontFamily:'default',textColor:'#ffffff',backgroundOpacity:75})}><span>Reset to defaults</span></button></>}
 {view==='size'&&sizes.map(x=>radio(`size-${x}`,x===pref('fontSize',100),`${x}%`,()=>{update('fontSize',x);setView('appearance')}))}
 {view==='family'&&families.map(x=>radio(`family-${x[0]}`,x[0]===pref('fontFamily','default'),x[1],()=>{update('fontFamily',x[0]);setView('appearance')}))}
 {view==='color'&&colors.map(x=>radio(`color-${x[0]}`,x[0]===pref('textColor','#ffffff'),x[1],()=>{update('textColor',x[0]);setView('appearance')}))}
 {view==='opacity'&&opacities.map(x=>radio(`opacity-${x}`,x===pref('backgroundOpacity',75),`${x}%`,()=>{update('backgroundOpacity',x);setView('appearance')}))}</>}</div>,containerRef.current)}</>;
}
