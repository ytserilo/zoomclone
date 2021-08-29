const { Sequelize, DataTypes } = require("sequelize");
// mysql://bd0742c8718dc9:f91ca089@eu-cdbr-west-01.cleardb.com/heroku_4a7c121306a27f8?reconnect=true
const sequelize = new Sequelize("heroku_4a7c121306a27f8", "bd0742c8718dc9", "f91ca089", {
  dialect: "mysql",
  host: "eu-cdbr-west-01.cleardb.com",
  define: {
    timestamps: false
  }
});

const User = sequelize.define("user", {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    allowNull: false
  },
  username: {
    type: Sequelize.STRING,
    allowNull: true
  },
  first_name: {
    type: Sequelize.STRING,
    allowNull: true
  },
  last_name: {
    type: Sequelize.STRING,
    allowNull: true
  },
  photo_url: {
    type: Sequelize.STRING,
    allowNull: true
  }
});

const Room = sequelize.define("room", {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false
  },
  name: {
    type: Sequelize.STRING,
    allowNull: false
  },
  date_created: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
});

User.hasMany(Room);
module.exports.User = User;
module.exports.Room = Room;

sequelize.sync({raw: true}).then(result=>{
  //console.log(result);
})
