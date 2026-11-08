import { exactKeys, record } from '../security/ipc';

export type Appearance = {
  theme: 'dark' | 'light' | 'system';
  accent: 'blue' | 'violet' | 'rose' | 'teal' | 'amber';
  background: 'theme' | 'dawn' | 'stars' | 'plain';
  textSize: 'small' | 'default' | 'large';
  density: 'comfortable' | 'compact';
  corners: 'soft' | 'rounded' | 'square';
  motion: 'system' | 'reduced';
};
export type Profile = { version: 1; name: string; bio: string; avatar: 'toast' | 'sun' | 'moon' | 'cloud' | 'star' | 'leaf'; appearance: Appearance };
export const PROFILE_KEY = 'buttertoast_profile';
export const defaultAppearance = (): Appearance => ({ theme:'dark',accent:'blue',background:'theme',textSize:'default',density:'comfortable',corners:'soft',motion:'system' });
export const defaultProfile = (): Profile => ({ version:1,name:'',bio:'',avatar:'toast',appearance:defaultAppearance() });
const choices: { [K in keyof Appearance]: readonly Appearance[K][] } = {
  theme:['dark','light','system'],accent:['blue','violet','rose','teal','amber'],background:['theme','dawn','stars','plain'],
  textSize:['small','default','large'],density:['comfortable','compact'],corners:['soft','rounded','square'],motion:['system','reduced']
};
export function parseAppearance(value: unknown): Appearance | null {
  if(!record(value)||!exactKeys(value,Object.keys(choices)))return null;
  for(const key of Object.keys(choices) as (keyof Appearance)[])if(!(choices[key] as readonly unknown[]).includes(value[key]))return null;
  return Object.fromEntries(Object.keys(choices).map(key=>[key,value[key]])) as Appearance;
}
export function parseProfile(value: unknown): Profile | null {
  if(!record(value)||!exactKeys(value,['version','name','bio','avatar','appearance'])||value.version!==1)return null;
  if(typeof value.name!=='string'||value.name.length>128||Array.from(value.name).length>32||/[\u0000-\u001f\u007f-\u009f\u200b\u200e-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u.test(value.name))return null;
  if(typeof value.bio!=='string'||value.bio.length>800||Array.from(value.bio).length>160||/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200b\u200e-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u.test(value.bio))return null;
  if(!['toast','sun','moon','cloud','star','leaf'].includes(value.avatar as string))return null;
  const appearance=parseAppearance(value.appearance);if(!appearance)return null;
  return {version:1,name:value.name.normalize('NFC').trim(),bio:value.bio.normalize('NFC').trim(),avatar:value.avatar as Profile['avatar'],appearance};
}
/** User-editable metadata is presentation only. Never consume roles, URLs, CSS or permissions. */
export function profileFromUser(user: unknown): {profile:Profile;warning:string} {
  const metadata=record(user)&&record(user.user_metadata)?user.user_metadata:null;
  if(!metadata||!Object.hasOwn(metadata,PROFILE_KEY))return {profile:defaultProfile(),warning:''};
  const profile=parseProfile(metadata[PROFILE_KEY]);
  return profile?{profile,warning:''}:{profile:defaultProfile(),warning:'저장된 프로필 형식을 읽지 못해 기본 설정을 표시합니다. 저장하면 현재 설정으로 바뀝니다.'};
}
