export const getServiceTokens = () => {
  return {
    [process.env.GLOBAL_SERVICE_TOKEN_1]: {
      serviceName: "project-backend-1",
      permissions: {
        read: true,
        create: true,
        update: true,
        delete: true
      }
    },

    [process.env.GLOBAL_SERVICE_TOKEN_2]: {
      serviceName: "project-backend-2",
      permissions: {
        read: true,
        create: true,
        update: true,
        delete: false
      }
    }
  };
};
