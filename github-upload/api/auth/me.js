const { handleRequest } = require("../../server");

module.exports = async function handler(request, response) {
  request.url = "/api/auth/me";
  return handleRequest(request, response);
};
