const { handleRequest } = require("../../../server");

module.exports = async function handler(request, response) {
  request.url = "/api/auth/google/start";
  return handleRequest(request, response);
};
