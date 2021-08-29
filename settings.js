const redis = require("redis");
// redis://redistogo:2ab78279e9760e5bc722022ef6f78f69@soapfish.redistogo.com:11503/
module.exports = redis.createClient({
 host: "soapfish.redistogo.com",
 port: 11503,
 password: "2ab78279e9760e5bc722022ef6f78f69",
});
