let main_dir = __dirname.split("/");
main_dir = main_dir.slice(0, main_dir.length - 1).join("/")

const crypto = require("crypto");
const client = require(main_dir + "/settings.js");
const user_model = require("./model.js");

const BOT_TOKEN = "sometoken";
function uuidv4() {
 return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
   var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
   return v.toString(16);
 });
}

class User{
  async login(response, user){
    let keys = [];
    let hash = user["hash"];
    delete user["hash"];

    let data_check_string = [];
    for(let key in user){
      let part = "{}=" + user[key];

      part = part.replace("{}", key);
      data_check_string.push(part);
    }
    data_check_string.sort();
    data_check_string = data_check_string.join("\n");

    const secret_key = crypto.createHash("sha256").update(BOT_TOKEN);
    const check_hash = crypto.createHmac("sha256", data_check_string, secret_key);

    let result = hash.localeCompare(check_hash);

    if (result === 1) {
      let date = new Date();
      date = date.getTime() / 1000;
      if(date - user.auth_date > 86400){
        return false;
      }

      delete user["auth_date"];

      let result;
      let user_id = user.id;
      try{
        result = await user_model.User.create(user);
      }catch{
       try{
         delete user["id"];
         result = await user_model.User.update(user, {
           where: {
             id: user_id
           }
         });
       }
       catch{
         return false;
       }
      }

      let session_id = uuidv4();
      let cookie_session = session_id + ":{}".replace("{}", user_id);
      let one_week_delay = 60 * 60 * 24 * 7;
      response.cookie("session-id", cookie_session, {maxAge: one_week_delay, httpOnly: false});


      let new_salt = uuidv4();
      let secret_key = uuidv4();

      let now_date = new Date();
      now_date = now_date.getTime();

      let new_token = new_salt + secret_key + String(now_date);
      new_token = crypto.createHash("sha256").update(new_token);
      new_token = new_token.digest().toString("hex");


      client.setex(String(user_id), one_week_delay, JSON.stringify({
        "token": new_token,
        "auth-date": now_date,
        "session-id": session_id,
      }));

      return true;
    }
    else{
      return false;
    }
  }

}

module.exports = new User();
