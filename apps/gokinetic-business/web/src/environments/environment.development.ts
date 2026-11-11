export const environment = {
  production: false,
  apiBaseUrl: '/api/v1',
  oidc: {
    authorizationEndpoint: 'http://localhost:8180/realms/business/protocol/openid-connect/auth',
    tokenEndpoint: 'http://localhost:8180/realms/business/protocol/openid-connect/token',
    endSessionEndpoint: 'http://localhost:8180/realms/business/protocol/openid-connect/logout',
    clientId: 'gokinetic-business-portal',
    scope: 'openid profile email',
    audience: 'gokinetic-business-api'
  }
};
