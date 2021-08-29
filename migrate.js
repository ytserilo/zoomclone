const mysql = require("mysql2");

const connection = mysql.createConnection({
  host: "localhost",
  user: "yarik",
  database: "oly",
  password: "zzzhbr1111"
});

class Migrate{
  async user_table(){
    let query = "create table User(";
    query += "id int primary key not null unique,";
    query += "username varchar(128) not null unique,";
    query += "first_name varchar(128) not null,";
    query += "last_name varchar(128) not null,";
    query += "photo_url text);";


    let migrate_promise = new Promise((resolve, reject) => {
      async function migrate(){
        connection.query(query, function(err, results, fields){
          if(err != undefined && err.code == "ER_TABLE_EXISTS_ERROR"){
            connection.query("DROP TABLE User;");
            migrate();
          }
          else if(err != undefined){
            reject("Migrate table User -> not ok. Description: {}".replace("{}", err.sqlMessage));
          }
          else{
            resolve(true);
            console.log("Migrate table User -> ok.");
          }
        });
      }
      migrate();
    });
    await migrate_promise;
    connection.end();
  }
  //
}

let migrate = new Migrate();
migrate.user_table();
