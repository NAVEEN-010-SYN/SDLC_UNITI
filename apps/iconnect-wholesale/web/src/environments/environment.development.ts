export const environment = {
  production: false,
  apiBaseUrl: '/api/v1',
  oidc: {
    authority: 'http://localhost:8080/realms/uniti',
    clientId: 'iconnect-wholesale-web',
    scope: 'openid profile iconnect-wholesale-api',
  },
};
