export const environment = {
  production: true,
  apiBaseUrl: '/api/v1',
  oidc: {
    authority: '/auth/realms/uniti',
    clientId: 'iconnect-wholesale-web',
    scope: 'openid profile iconnect-wholesale-api',
  },
};
