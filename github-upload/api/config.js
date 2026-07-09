const { handleRequest } = require("../server");

module.exports = async function handler(request, response) {
  request.url = "/api/config";
  return handleRequest(request, response);
};
