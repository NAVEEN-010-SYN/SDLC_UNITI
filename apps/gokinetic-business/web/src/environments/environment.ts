/**
 * Production settings. These are public client identifiers only; no secrets belong in the SPA.
 * The deployment pipeline substitutes the identity-provider URLs per environment.
 */
export const environment = {
  production: true,
  apiBaseUrl: '/api/v1',
  oidc: {
    authorizationEndpoint: 'https://id.example-uniti.net/realms/business/protocol/openid-connect/auth',
    tokenEndpoint: 'https://id.example-uniti.net/realms/business/protocol/openid-connect/token',
    endSessionEndpoint: 'https://id.example-uniti.net/realms/business/protocol/openid-connect/logout',
    clientId: 'gokinetic-business-portal',
    scope: 'openid profile email',
    audience: 'gokinetic-business-api'
  }
};
