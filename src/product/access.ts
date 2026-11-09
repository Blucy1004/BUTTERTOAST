/** Main-owned product capabilities. User metadata, UI input and API keys never grant entitlements. */
export type Feature='browsing'|'byok'|'toastir'|'basic-history'|'workspaces'|'chatgpt-subscription'|'advanced-queue'|'workflow-editor';
const free=new Set<Feature>(['browsing','byok','toastir','basic-history','workspaces']);
export function featureAccess(feature:unknown):{allowed:boolean;reason:string} {
  if(typeof feature==='string'&&free.has(feature as Feature))return {allowed:true,reason:'Original 무료 핵심 기능'};
  return {allowed:false,reason:feature==='chatgpt-subscription'?'공식 연동 적용 조건과 승인 확인 후 제공':'아직 구현·검증되지 않은 기능'};
}
export function requireFeature(feature:Feature):void {if(!featureAccess(feature).allowed)throw new Error('Feature unavailable');}
export function productState(){return {plan:'Original',billingEnabled:false,artificialAiDelayMs:0,
  plans:[{tier:'Free',name:'Original',status:'제공 중',price:null},{tier:'Go',name:'Margarine',status:'기획 · 판매 안 함',price:null},{tier:'Pro',name:'100% Milk',status:'기획 · 판매 안 함',price:null},{tier:'Ultra',name:'Organic',status:'기획 · 판매 안 함',price:null}],
  features:(['browsing','byok','toastir','basic-history','workspaces','chatgpt-subscription','advanced-queue','workflow-editor'] as Feature[]).map(id=>({id,...featureAccess(id)})),
  donations:{configured:false,amount:null,target:null},
  progress:['일반 브라우징·로컬 북마크·방문 기록','ToastIR DOM·Shadow DOM 실행과 문서에 묶인 승인','OpenAI·Anthropic·Gemini·호환 API 연결','기기 내 계정 설정과 선택적 프로필 동기화'],
  pending:['공식 ChatGPT 구독 연동의 적용 조건·승인 및 통합','코드 서명·운영 자동 업데이트','워크플로 편집기·고급 대기열','배포한 계정 삭제 서버와 기기별 세션 목록']};}
export function supportDestination(id:unknown):string|null {
  return id==='source'?'https://github.com/Blucy1004/BUTTERTOAST':id==='roadmap'?'https://github.com/Blucy1004/BUTTERTOAST/blob/main/docs/DEVELOPMENT_STATE.md':id==='chatgpt-docs'?'https://developers.openai.com/siwc/quickstart':null;
}
