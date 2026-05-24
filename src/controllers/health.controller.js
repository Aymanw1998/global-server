export const healthCheck = (req, res) => {
  return res.status(200).json({
    success: true,
    service: "global-backend",
    status: "OK",
    time: new Date().toISOString()
  });
};
