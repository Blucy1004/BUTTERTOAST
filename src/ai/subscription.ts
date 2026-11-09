/** Integration contract only. No OAuth endpoint is called until the product's official integration is approved and implemented. */
export type SubscriptionIdentity={issuer:string;subject:string;clientId:string;hostId:string;scopes:readonly string[]};
export type SubscriptionStatus={enabled:false;reason:'approval-and-integration-pending';requiresButterToastPurchase:false};
export interface OfficialSubscriptionClient {
  status():SubscriptionStatus|{enabled:true;identity:SubscriptionIdentity;expiresAt:number};
  connect(signal:AbortSignal):Promise<void>;
  disconnect():Promise<void>;
  // The implementation must validate OIDC/JWKS, state, nonce, PKCE, account binding and granted plan-use scope.
  // Tokens remain in main/OS storage. Inference is a separate Responses/SSE adapter, never API-key impersonation.
}
export const subscriptionStatus=():SubscriptionStatus=>({enabled:false,reason:'approval-and-integration-pending',requiresButterToastPurchase:false});
