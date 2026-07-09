const { handleRequest } = require("../../../server");

module.exports = async function handler(request, response) {
  const incomingUrl = new URL(request.url, `https://${request.headers.host}`);
  request.url = `/api/auth/google/callback${incomingUrl.search}`;
  return handleRequest(request, response);
};
