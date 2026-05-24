import { getServiceTokens } from "../config/serviceTokens.js";

export const authService = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      error: "Missing or invalid Authorization header"
    });
  }

  const token = authHeader.split(" ")[1];
  const serviceTokens = getServiceTokens();
  const service = serviceTokens[token];

  if (!service) {
    return res.status(403).json({
      success: false,
      error: "Unauthorized service"
    });
  }

  req.serviceName = service.serviceName;
  req.permissions = service.permissions;

  next();
};
