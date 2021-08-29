import { connection_manager, self_id, event_loop, self_files_store, download, media, users_store } from "/static/js/event_loop.js";
import { microphone_visualize } from "/static/js/settings.js";
import { RTC } from "/static/js/rtc.js";

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0,
        v = c == 'x' ? r : r & 0x3 | 0x8;
    return v.toString(16);
  });
}

let video_component_states = {};

class VideoComponent extends React.Component {
  constructor(props) {
    super(props);
    let old_obj = video_component_states[this.props.component_id];
    this.state = {
      "video": old_obj.video,
      "audio": old_obj.audio
    };
    this.handler = this.handler.bind(this);
    this.change_media_handler = this.change_media_handler.bind(this);
    this.video_stream_control = this.video_stream_control.bind(this);
    this.handler();
  }

  componentWillUnmount() {
    this.props.handler.removeEventListener("change-media", this.change_media_handler);
    this.props.handler.removeEventListener("video-stream-control", this.video_stream_control);
  }

  change_media_handler(e) {
    const self = this;
    let data = e.detail;
    let main_state = video_component_states[self.props.component_id];
    let new_state = self.state;

    if (data["mode"] == "video") {
      new_state["video"] = data["status"];
      main_state["video"] = data["status"];
    } else if (data["mode"] == "audio") {
      new_state["audio"] = data["status"];
      main_state["audio"] = data["status"];
    }

    video_component_states[self.props.component_id] = main_state;
    self.setState(new_state);
  }

  video_stream_control(e) {
    const self = this;
    let data = e.detail;

    if (self.props.component_id == "self" || self.props.component_id == "self-share-screen") {
      return;
    }

    let send_data = {
      "type": "video-stream-control",
      "conn-id": self.props.component_id
    };

    if (data["width"] == 0 || data["height"] == 0) {
      send_data["mode"] = "off";
    } else {
      send_data["mode"] = "on";
      send_data["width"] = data["width"];
      send_data["height"] = data["height"];
    }

    let id = self.props.component_id.replace("share-screen", "");
    let id_v2 = id.split("||").reverse().join("||");

    if (connection_manager.active_connections[id] != undefined) {
      let conn = connection_manager.active_connections[id];
      conn.channel.send(JSON.stringify(send_data));
    } else if (connection_manager.active_connections[id_v2] != undefined) {
      let conn = connection_manager.active_connections[id_v2];
      conn.channel.send(JSON.stringify(send_data));
    }
  }

  handler() {
    this.props.handler.addEventListener("video-stream-control", this.video_stream_control);
    this.props.handler.addEventListener("change-media", this.change_media_handler);
  }

  render() {
    let audio;
    let display_style;
    let state = video_component_states[this.props.component_id];

    if (this.props.component_id == "self") {
      audio = /*#__PURE__*/React.createElement("span", {
        style: {
          display: "none"
        }
      });
    } else {
      audio = /*#__PURE__*/React.createElement("audio", {
        autoplay: "autoplay",
        style: {
          display: "none"
        }
      });
    }

    let microphone_obj;
    let video_obj;

    if (state["video"] == true) {
      display_style = {
        "display": "none"
      };
      video_obj = /*#__PURE__*/React.createElement("img", {
        src: "/static/icons/white-video-solid.svg"
      });
    } else {
      display_style = {
        "display": ""
      };
      video_obj = /*#__PURE__*/React.createElement("img", {
        src: "/static/icons/white-video-slash-solid.svg"
      });
    }

    if (state["audio"] == true) {
      microphone_obj = /*#__PURE__*/React.createElement("img", {
        src: "/static/icons/white-microphone-solid.svg"
      });
    } else {
      microphone_obj = /*#__PURE__*/React.createElement("img", {
        src: "/static/icons/white-microphone-slash-solid.svg"
      });
    }

    let img_style = {
      "display": ""
    };

    if (state["mini"] == true) {
      img_style = {
        "display": "none"
      };
    }

    return /*#__PURE__*/React.createElement("div", {
      dataId: this.props.component_id,
      class: "user-block"
    }, /*#__PURE__*/React.createElement("div", {
      class: "media-view"
    }, /*#__PURE__*/React.createElement("video", {
      videoId: this.props.component_id,
      onClick: this.props.click_handler,
      autoplay: "autoplay",
      playsinline: "true"
    }), audio, /*#__PURE__*/React.createElement("div", {
      style: display_style,
      class: "user-data"
    }, /*#__PURE__*/React.createElement("img", {
      style: img_style,
      src: this.props.photo_url
    }), /*#__PURE__*/React.createElement("span", {
      class: "name"
    }, this.props.name))), /*#__PURE__*/React.createElement("div", {
      class: "status-buttons"
    }, microphone_obj, video_obj));
  }

  componentDidMount() {
    const self = this;
    let id = this.props.component_id;
    let block = document.querySelector("div[dataId='" + id + "']");

    if (this.listener == undefined) {
      function size_observer() {
        let width = Math.floor(block.offsetWidth);
        let height = Math.floor(block.offsetHeight);

        if (width % 2 != 0) {
          width += 1;
        }

        if (height % 2 != 0) {
          height += 1;
        }

        self.props.handler.dispatchEvent(new CustomEvent("video-stream-control", {
          detail: {
            "width": width,
            "height": height
          }
        }));
      }

      new ResizeObserver(size_observer).observe(block);
      this.listener = true;
    }

    let imgs = block.querySelectorAll(".status-buttons img");
    let video = block.querySelector("video");
    let audio = block.querySelector("audio");
    let new_state = this.state;

    if (this.props.tracks["video"] != undefined) {
      new_state["video"] = true;
      let videoStream = new MediaStream([this.props.tracks["video"]]);

      if (typeof video.srcObject == "object") {
        video.srcObject = videoStream;
      } else {
        video.src = URL.createObjectURL(videoStream);
      }

      if (this.props.tracks["video"].enabled == false) {
        imgs[1].setAttribute("src", "/static/icons/white-video-slash-solid.svg");
      }
    } else {
      new_state["video"] = false;
      imgs[1].setAttribute("src", "/static/icons/white-video-slash-solid.svg");
    }

    if (this.props.tracks["audio"] == undefined) {
      new_state["audio"] = false;
      imgs[0].setAttribute("src", "/static/icons/white-microphone-slash-solid.svg");
    }

    if (this.props.component_id != "self") {
      if (this.props.tracks["audio"] == undefined) {
        new_state["audio"] = false;
        imgs[0].setAttribute("src", "/static/icons/white-microphone-slash-solid.svg");

        if (this.props.update_event == false) {
          this.setState(new_state);
        }

        return;
      }

      new_state["audio"] = true;
      let audioStream = new MediaStream([this.props.tracks["audio"]]);

      if (typeof audio.srcObject == "object") {
        audio.srcObject = audioStream;
      } else {
        audio.src = URL.createObjectURL(audioStream);
      }

      if (this.props.tracks["audio"].enabled == false) {
        new_state["audio"] = false;
        imgs[0].setAttribute("src", "/static/icons/white-microphone-slash-solid.svg");
      }
    } else if (this.props.tracks["audio"] != undefined && this.props.component_id == "self") {
      new_state["audio"] = true;
    }

    if (this.props.update_event == false) {
      this.setState(new_state);
    }
  }

}

class BigView extends React.Component {
  constructor(props) {
    super(props);
    this.onwheel_event = this.onwheel_event.bind(this);
    this.full_screen = this.full_screen.bind(this);
    this.state = {
      "x-scroll": 0,
      "full_screen": "Open"
    };
  }

  onwheel_event(e) {
    let x = 10;

    if (e.deltaY > 0) {
      x = -10;
    }

    let header = document.querySelector(".header");
    let scroll_width = header.scrollWidth;
    let offset_width = document.querySelector(".video-wrapper").offsetWidth;
    let scroll_x = this.state["x-scroll"];
    scroll_x += x;
    let max = scroll_width - offset_width;

    if (scroll_x > max) {
      scroll_x = max;
    } else if (scroll_x < 0) {
      scroll_x = 0;
    }

    this.setState({
      "x-scroll": scroll_x
    });
    header.scrollTo(scroll_x, 0);
  }

  full_screen() {
    if (this.state.full_screen == "Open") {
      this.setState({
        "full_screen": "Hide"
      });
    } else {
      this.setState({
        "full_screen": "Open"
      });
    }

    this.props.full_screen();
  }

  render() {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "contents"
      }
    }, /*#__PURE__*/React.createElement("div", {
      class: "header",
      onWheel: this.onwheel_event
    }, this.props.data["videoblocks"].map(function (item) {
      return item["obj"];
    })), /*#__PURE__*/React.createElement("div", {
      class: "big-video"
    }, /*#__PURE__*/React.createElement("div", {
      class: "controls"
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: this.props.close_handler,
      name: "button"
    }, "Close"), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: this.full_screen,
      name: "button"
    }, this.state.full_screen)), this.props.data["main-block"]["obj"]));
  }

}

class MessageObj extends React.Component {
  constructor(props) {
    super(props);
    this.download_file = this.download_file.bind(this);
  }

  download_file() {
    let conn_id = connection_manager.get_conn(this.props.file["sender-id"]);
    download(this.props.file.link, conn_id, this.props.file.size, this.props.file.file_name); // connection_manager.active_connections[conn_id].channel.send(JSON.stringify({
    //   "type": "file",
    //   "mode": "get-file",
    //   "link": this.props.file.link,
    //   "sender-id": self_id,
    // }));
  }

  render() {
    let obj;
    let button;

    if (this.props.owner != "self") {
      button = /*#__PURE__*/React.createElement("button", {
        type: "button",
        onClick: this.download_file,
        "data-id": this.props.file.link,
        name: "button"
      }, /*#__PURE__*/React.createElement("img", {
        src: "/static/icons/download-solid.svg",
        alt: ""
      }));
    } else {
      button = /*#__PURE__*/React.createElement("span", null);
    }

    let avatar;

    if (this.props.file != false) {
      // this.props.file = {file_name, size, link}
      avatar = this.props.file.photo_url;
      obj = /*#__PURE__*/React.createElement("div", {
        class: "file"
      }, /*#__PURE__*/React.createElement("span", {
        class: "author-name"
      }, this.props.file.sender_name), /*#__PURE__*/React.createElement("div", {
        class: "file-wrapper"
      }, button, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, this.props.file.file_name), /*#__PURE__*/React.createElement("span", null, this.props.file.size, " Kb"))));
    } else {
      avatar = this.props.message.photo_url;
      obj = /*#__PURE__*/React.createElement("div", {
        class: "text"
      }, /*#__PURE__*/React.createElement("span", {
        class: "author-name"
      }, this.props.message.sender_name), /*#__PURE__*/React.createElement("div", {
        class: "text-wrapper"
      }, /*#__PURE__*/React.createElement("span", null, this.props.message.text)));
    }

    let class_name = "message-wrapper {}".replace("{}", this.props.owner);
    return /*#__PURE__*/React.createElement("div", {
      class: class_name
    }, /*#__PURE__*/React.createElement("div", {
      class: "message-obj"
    }, /*#__PURE__*/React.createElement("div", {
      class: "author"
    }, /*#__PURE__*/React.createElement("img", {
      src: avatar,
      alt: ""
    })), obj));
  }

}

class ChatView extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      "messages": []
    };
    const self = this;
    document.addEventListener("message", function (e) {
      let data = e.detail;
      let messages = self.state["messages"];
      messages.push(data);
      self.setState({
        "messages": messages
      });
    });
  }

  render() {
    return /*#__PURE__*/React.createElement("div", {
      class: "chat-content"
    }, this.state.messages.map(function (item) {
      return /*#__PURE__*/React.createElement(MessageObj, {
        file: item.file,
        owner: item.owner,
        message: item.message
      });
    }));
  }

}

ReactDOM.render( /*#__PURE__*/React.createElement(ChatView, null), document.querySelector(".chat"));

class VideoGrid extends React.Component {
  constructor(props) {
    super(props);
    this.click_handler = this.click_handler.bind(this);
    this.close_handler = this.close_handler.bind(this);
    this.full_screen = this.full_screen.bind(this);
    this.init = this.init.bind(this);
    this.video_grid_view = this.video_grid_view.bind(this);
    this.left_click_handler = this.left_click_handler.bind(this);
    this.right_click_handler = this.right_click_handler.bind(this);
    this.outputsize = this.outputsize.bind(this);
    this.state = {
      "videoblocks": [],
      "main-block": false,
      "current-page": 0,
      "count-pages": 1,
      "part-size": "full"
    };
    this.init();
  }

  outputsize(video_block, return_value = false) {
    let width = video_block.offsetWidth;
    let height = video_block.offsetHeight;
    let cols = Math.floor(width / 210);
    let rows = Math.floor(height / 210);
    let part_size = Math.floor(cols * rows);
    let pages = this.state.videoblocks.length / part_size;

    if (pages == Infinity) {
      pages = 0;
    }

    let count_pages = Math.floor(pages);

    if (count_pages < pages) {
      count_pages += 1;
    }

    let new_state = {
      "current-page": 1,
      "part-size": part_size,
      "count-pages": count_pages
    };

    if (return_value == false) {
      this.setState(new_state);
    } else {
      return new_state;
    }
  }

  video_grid_view() {
    const self = this;
    let video_block = document.querySelector(".video-block");

    function size_observer() {
      self.outputsize(video_block);
    }

    new ResizeObserver(size_observer).observe(video_block);
  }

  init() {
    this.video_grid_view();
    const self = this;
    document.addEventListener("change-media", function (e) {
      let data = e.detail;
      let videoblocks = self.state["videoblocks"];

      for (let i = 0; i < videoblocks.length; i++) {
        if (videoblocks[i]["obj"].props.component_id == data["conn-id"]) {
          let handler_target = videoblocks[i]["obj"].props.handler;
          handler_target.dispatchEvent(new CustomEvent("change-media", {
            detail: data
          }));
          break;
        }
      }

      if (self.state["main-block"]["id"] == data["conn-id"]) {
        let handler_target = self.state["main-block"]["obj"].props.handler;
        handler_target.dispatchEvent(new CustomEvent("change-media", {
          detail: data
        }));
      }
    });
    document.addEventListener("new-media-connection", async function (e) {
      let video_blocks = self.state["videoblocks"];
      let data = e.detail;
      const myComponent = [true].map(item => {
        let handler_target = new EventTarget();
        let sender_id = connection_manager.get_other_id(data["id"]);
        let person;

        if (sender_id == false) {
          person = users_store[self_id];
        } else {
          person = users_store[sender_id.replace("share-screen", "")];
        }

        let name;

        if (person.id != self_id) {
          name = person["first_name"] + " " + person["last_name"];
          name = name.replace("null", "");
        } else {
          name = "You";
        }

        let photo_url = person.photo_url;

        if (photo_url == null) {
          photo_url = "/static/icons/unnamed.png";
        }

        let update_event = false;

        if (video_component_states[data["id"]] != undefined) {
          update_event = true;
        } else {
          video_component_states[data["id"]] = {
            "video": true,
            "audio": true
          };
        }

        if (self.state["main-block"] == true) {
          video_component_states[data["id"]]["mini"] = true;
        } else {
          video_component_states[data["id"]]["mini"] = false;
        }

        return /*#__PURE__*/React.createElement(VideoComponent, {
          handler: handler_target,
          click_handler: self.click_handler,
          component_id: data["id"],
          tracks: data["tracks"],
          name: name,
          photo_url: photo_url,
          update_event: update_event
        });
      });

      for (let i = 0; i < video_blocks.length; i++) {
        if (video_blocks[i]["id"] == data["id"] && data["id"] == "self") {
          video_blocks = video_blocks.slice(0, i).concat(video_blocks.slice(i + 1));
          let promise = new Promise((resolve, reject) => {
            self.resolve = resolve;
          });
          self.setState({
            "videoblocks": video_blocks
          });
          await promise;
          video_blocks = [{
            "id": data["id"],
            "obj": myComponent[0]
          }].concat(self.state["videoblocks"]);
          self.setState({
            "videoblocks": video_blocks
          });
          promise = new Promise((resolve, reject) => {
            self.resolve = resolve;
          });
          self.setState({
            "videoblocks": []
          });
          await promise;
          self.setState({
            "videoblocks": video_blocks
          });
          return;
        }
      }

      let promise = new Promise((resolve, reject) => {
        self.resolve = resolve;
      });
      let newstate = {};
      newstate["main-block"] = self.state["main-block"];

      if (self.state["main-block"]["id"] == data["id"]) {
        newstate["main-block"] = self.state["main-block"];
        newstate["main-block"]["obj"] = myComponent[0];
      } else {
        video_blocks.push({
          "id": data["id"],
          "obj": myComponent[0]
        });
      }

      newstate["videoblocks"] = video_blocks;
      self.setState(newstate);
      await promise;
      let video_div = document.querySelector(".video-block");
      let new_state = self.outputsize(video_div, true);
      self.setState(new_state);
      promise = new Promise((resolve, reject) => {
        self.resolve = resolve;
      });
      self.setState({
        "videoblocks": [],
        "main-block": false
      });
      await promise;
      self.setState(newstate);
    });
    document.addEventListener("close-media-connection", async function (e) {
      let data = e.detail;
      let video_blocks = self.state["videoblocks"];
      delete video_component_states[data["id"]];

      if (self.state["main-block"] != false) {
        if (self.state["main-block"]["id"] == data["id"]) {
          self.setState({
            "main-block": false
          });
          return;
        }
      }

      for (let i = 0; i < video_blocks.length; i++) {
        if (video_blocks[i]["id"] == data["id"]) {
          video_blocks.splice(i, 1);
          break;
        }
      }

      let promise = new Promise((resolve, reject) => {
        self.resolve = resolve;
      });
      self.setState({
        "videoblocks": video_blocks
      });
      await promise;
      let video_div = document.querySelector(".video-block");
      let new_state = self.outputsize(video_div, true);
      self.setState(new_state);
      promise = new Promise((resolve, reject) => {
        self.resolve = resolve;
      });
      self.setState({
        "videoblocks": []
      });
      await promise;
      self.setState({
        "videoblocks": video_blocks
      });
    });
  }

  async click_handler(e) {
    const self = this;
    let id = e.target.parentElement.parentElement.getAttribute("dataId");

    if (this.state["main-block"] != false) {
      //let promise = new Promise((resolve, reject) => {
      //  self.resolve = resolve;
      //});
      await this.close_handler(); //await promise;
    }

    let videoblocks = this.state["videoblocks"];

    for (let i = 0; i < videoblocks.length; i++) {
      if (videoblocks[i]["id"] == id) {
        continue;
      } else {
        video_component_states[videoblocks[i]["obj"].props.component_id]["mini"] = true;
      }
    }

    for (let i = 0; i < videoblocks.length; i++) {
      if (videoblocks[i]["id"] == id) {
        let obj = videoblocks.splice(i, 1)[0];
        obj["old-index"] = i;
        this.setState({
          "videoblocks": videoblocks,
          "main-block": obj
        });
        break;
      }
    }
  }

  shouldComponentUpdate(next_props, next_state) {
    let res = this.resolve;

    if (res == undefined) {
      return true;
    }

    res(true);
    this.resolve = undefined;
    return true;
  }

  async close_handler() {
    let ready_resolve;
    let ready = new Promise((resolve, reject) => {
      ready_resolve = resolve;
    });
    const self = this;
    let id = this.state["main-block"]["id"];
    let videoblocks = this.state["videoblocks"].slice();
    let old_index = this.state["main-block"]["old-index"];
    let old_obj = {
      "id": this.state["main-block"]["id"],
      "obj": this.state["main-block"]["obj"]
    };
    videoblocks = videoblocks.slice(0, old_index).concat([old_obj]).concat(videoblocks.slice(old_index));
    let promise = new Promise((resolve, reject) => {
      self.resolve = resolve;
    });

    for (let i = 0; i < videoblocks.length; i++) {
      if (videoblocks[i]["id"] == id) {
        continue;
      } else {
        video_component_states[videoblocks[i]["obj"].props.component_id]["mini"] = false;
      }
    }

    this.setState({
      "videoblocks": videoblocks,
      "main-block": false
    });
    await promise;
    let video_div = document.querySelector(".video-block");
    let new_state = this.outputsize(video_div, true);
    promise = new Promise((resolve, reject) => {
      self.resolve = resolve;
    });
    this.setState(new_state);
    await promise;
    ready_resolve(true);
    return ready;
  }

  full_screen() {
    if (!document.fullscreenElement) {
      document.querySelector(".big-video").requestFullscreen();
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  left_click_handler() {
    if (this.state["current-page"] - 1 >= 1) {
      this.setState({
        "current-page": this.state["current-page"] - 1
      });
    }
  }

  right_click_handler() {
    if (this.state["current-page"] + 1 <= this.state["count-pages"]) {
      this.setState({
        "current-page": this.state["current-page"] + 1
      });
    }
  }

  render() {
    let component;
    let left_style;
    let right_style;
    let obj_style = {
      "height": "fit-content"
    };
    let pags = [];

    if (this.state["main-block"] == false) {
      let videoblocks = this.state["videoblocks"];

      if (this.state["part-size"] == "full") {
        left_style = "none";
        right_style = "none";
      } else {
        if (this.state["current-page"] == 1) {
          left_style = "none";
        }

        if (this.state["count-pages"] == 1) {
          right_style = "none";
        } else if (this.state["current-page"] == this.state["count-pages"]) {
          right_style = "none";
        }
      }

      if (this.state["part-size"] == "full") {
        videoblocks = videoblocks.slice(this.state["current-page"]);
        component = videoblocks.map(function (item) {
          return item["obj"];
        });
      } else {
        let i = 0;
        let start = this.state["current-page"] * this.state["part-size"] - this.state["part-size"];
        let fin = start + this.state["part-size"];
        component = videoblocks.map(function (item) {
          let obj;
          item["obj"]; // /this.props.handler.addEventListener("video-stream-control"

          if (i >= start && i < fin) {
            obj = /*#__PURE__*/React.createElement("div", {
              style: {
                display: ""
              }
            }, item["obj"]);
          } else {
            item["obj"].props.handler.dispatchEvent(new CustomEvent("video-stream-control", {
              detail: {
                "width": 0,
                "height": 0
              }
            }));
            obj = /*#__PURE__*/React.createElement("div", {
              style: {
                display: "none"
              }
            }, item["obj"]);
          }

          i++;
          return obj;
        });
      }

      if (this.state["count-pages"] > 1) {
        for (let i = 0; i < this.state["count-pages"]; i++) {
          if (i == this.state["current-page"] - 1) {
            pags.push( /*#__PURE__*/React.createElement("span", {
              class: "active-dot"
            }));
          } else {
            pags.push( /*#__PURE__*/React.createElement("span", null));
          }
        }
      }
    } else {
      left_style = "none";
      right_style = "none";
      obj_style["height"] = "100%";
      component = /*#__PURE__*/React.createElement(BigView, {
        data: this.state,
        close_handler: this.close_handler,
        full_screen: this.full_screen
      });
    }

    return /*#__PURE__*/React.createElement("div", {
      style: obj_style,
      class: "video-wrapper"
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: this.left_click_handler,
      style: {
        display: left_style
      },
      id: "left"
    }, /*#__PURE__*/React.createElement("img", {
      src: "/static/icons/angle-left-solid.svg"
    })), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: this.right_click_handler,
      style: {
        display: right_style
      },
      id: "right"
    }, /*#__PURE__*/React.createElement("img", {
      src: "/static/icons/angle-right-solid.svg"
    })), /*#__PURE__*/React.createElement("div", {
      class: "page-dots"
    }, pags), component);
  }

}

ReactDOM.render( /*#__PURE__*/React.createElement(VideoGrid, null), document.querySelector(".video-block"));

class MessageComponent extends React.Component {
  constructor(props) {
    super(props);
    this.send_message = this.send_message.bind(this);
    this.message_handler = this.input_handler.bind(this);
    this.choose_files = this.choose_files.bind(this);
    this.open_file_menu = this.open_file_menu.bind(this);
    this.message_text = React.createRef();
    this.file_obj = React.createRef();
    this.state = {
      "files": {}
    };
  }

  send_message(e) {
    e.preventDefault();
    let message_text = this.message_text.current.value; // delete files from form

    if (message_text == "") {
      return;
    }

    connection_manager.send_message({
      "type": "message",
      "message": message_text,
      "sender_id": self_id
    });
    this.message_text.current.value = "";
    this.message_text.current.style.height = "";
    this.message_text.current.style.height = "34px";
    let sender_person = users_store[self_id];
    let photo_url = sender_person["photo_url"];

    if (sender_person["photo_url"] == null) {
      photo_url = "/static/icons/unnamed.png";
    }

    document.dispatchEvent(new CustomEvent("message", {
      detail: {
        "file": false,
        "owner": "self",
        "message": {
          "text": message_text,
          "photo_url": photo_url,
          "sender_name": "You"
        }
      }
    }));
  }

  input_handler(e) {
    const heightLimit = 200;
    const textarea = e.target;
    textarea.style.height = "";
    textarea.style.height = Math.min(textarea.scrollHeight, heightLimit) + "px";
  }

  choose_files(e) {
    let files = this.file_obj.current.files;
    let choosen_files = {};

    for (let i = 0; i < files.length; i++) {
      let key = uuidv4();
      choosen_files[key] = files[i];
    }

    let sender_person = users_store[self_id];
    let photo_url = sender_person["photo_url"];

    if (sender_person["photo_url"] == null) {
      photo_url = "/static/icons/unnamed.png";
    }

    for (let link in choosen_files) {
      connection_manager.send_message({
        "type": "file",
        "mode": "link",
        "file": {
          "file_name": choosen_files[link].name,
          "link": link,
          "size": choosen_files[link].size
        },
        "sender-id": self_id
      });
      self_files_store[link] = choosen_files[link];
      document.dispatchEvent(new CustomEvent("message", {
        detail: {
          "file": {
            "file_name": choosen_files[link].name,
            "link": link,
            "size": choosen_files[link].size,
            "sender_name": "You",
            "photo_url": photo_url
          },
          "owner": "self",
          "message": ""
        }
      }));
    } // this.setState({"files": choosen_files});

  }

  open_file_menu() {
    this.file_obj.current.click();
  }

  render() {
    return /*#__PURE__*/React.createElement("div", {
      class: "message-input-block"
    }, /*#__PURE__*/React.createElement("div", {
      class: "info-block"
    }, /*#__PURE__*/React.createElement("textarea", {
      ref: this.message_text,
      cols: "23",
      onInput: this.input_handler
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        width: "2.5rem",
        position: "relative"
      }
    }, /*#__PURE__*/React.createElement("input", {
      style: {
        display: "none"
      },
      type: "file",
      multiple: true,
      onChange: this.choose_files,
      ref: this.file_obj
    }), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: this.open_file_menu
    }, /*#__PURE__*/React.createElement("img", {
      src: "/static/icons/paperclip-solid.svg",
      alt: "files"
    })))), /*#__PURE__*/React.createElement("div", {
      style: {
        width: "4rem",
        position: "relative"
      }
    }, /*#__PURE__*/React.createElement("button", {
      id: "send",
      onClick: this.send_message,
      type: "button"
    }, /*#__PURE__*/React.createElement("img", {
      src: "/static/icons/paper-plane-solid.svg",
      alt: "send"
    }))));
  }

}

ReactDOM.render( /*#__PURE__*/React.createElement(MessageComponent, null), document.querySelector("#message-input-block-wrapper"));

class RecordScreen extends React.Component {
  constructor(props) {
    super(props); // props -> {parent_obj, screen_stream}

    let recorder = new MediaRecorder(this.props.screen_stream);
    recorder.start();
    const self = this;
    this.props.bridge.dispatchEvent(new CustomEvent("child-obj", {
      detail: self
    }));
    this.stop_recording = this.stop_recording.bind(this);
    this.pause_recording = this.pause_recording.bind(this);
    this.resume_recording = this.resume_recording.bind(this);
    this.state = {
      "recorder": recorder,
      "status": "recording"
    };
  }

  stop_recording() {
    let recorder = this.state["recorder"];

    recorder.ondataavailable = e => {
      let a = document.createElement('a');
      a.download = ['video_', (new Date() + '').slice(4, 28), '.webm'].join('');
      a.href = URL.createObjectURL(e.data);
      a.textContent = a.download;
      a.click();
    };

    try {
      recorder.stop();
    } catch {}

    try {
      let tracks = this.props.screen_stream.getTracks();
      tracks.forEach(track => track.stop());
    } catch {}

    this.props.parent_obj.stop_recording();
    ReactDOM.unmountComponentAtNode(document.getElementById("record-controll"));
  }

  pause_recording() {
    this.state["recorder"].pause();
    this.setState({
      "status": "pause"
    });
  }

  resume_recording() {
    this.state["recorder"].resume();
    this.setState({
      "status": "recording"
    });
  }

  render() {
    let buttons_arr = [];
    let status = this.state["status"];

    if (status == "recording") {
      buttons_arr = [/*#__PURE__*/React.createElement("button", {
        type: "button",
        onClick: this.stop_recording,
        name: "button"
      }, "Stop"), /*#__PURE__*/React.createElement("button", {
        type: "button",
        onClick: this.pause_recording,
        name: "button"
      }, "Pause")];
    } else if (status == "pause") {
      buttons_arr = [/*#__PURE__*/React.createElement("button", {
        type: "button",
        onClick: this.stop_recording,
        name: "button"
      }, "Stop"), /*#__PURE__*/React.createElement("button", {
        type: "button",
        onClick: this.resume_recording,
        name: "button"
      }, "Resume")];
    }

    return /*#__PURE__*/React.createElement("div", {
      class: "manage-stream-recorder"
    }, buttons_arr.map(function (item) {
      return item;
    }));
  }

}

class ManageHandler extends EventTarget {
  constructor() {
    super();
  }

}

class ManageComponent extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      "share-screen": false,
      "record-screen": false,
      "microphone": true,
      "video": true,
      "comment": true,
      "mobile-view": false
    };
    this.toggle = this.toggle.bind(this);
    this.microphone_toggle = this.microphone_toggle.bind(this);
    this.video_toggle = this.video_toggle.bind(this);
    this.chat_toggle = this.chat_toggle.bind(this);
    this.screen_record = this.screen_record.bind(this);
    this.share_screen = this.share_screen.bind(this);
    this.create_screen_stream = this.create_screen_stream.bind(this);
    this.settings = this.settings.bind(this);
    const self = this;

    this.change_size = function () {
      let main_container = document.querySelector(".main-container");

      if (main_container.offsetWidth < 700) {
        if (self.state["mobile-view"] == false) {
          let obj = document.querySelector("#comment");
          obj.children[0].setAttribute("src", "/static/icons/comment-slash-solid.svg");
          self.setState({
            "mobile-view": true,
            "comment": false
          });
        }
      } else {
        let obj = document.querySelector("#comment");
        obj.children[0].setAttribute("src", "/static/icons/comment-solid.svg");
        self.setState({
          "mobile-view": false,
          "comment": true
        });
      }
    };
  }

  toggle(e, obj_name) {
    let target = e.target;
    let status = target.getAttribute("status");
    let child = target.children[0];

    if (child == undefined) {
      child = target;
    }

    if (this.state[obj_name] == true) {
      child.setAttribute("src", "/static/icons/{}-slash-solid.svg".replace("{}", obj_name));
      let new_state = {};
      new_state[obj_name] = false;
      this.setState(new_state);
    } else {
      child.setAttribute("src", "/static/icons/{}-solid.svg".replace("{}", obj_name));
      let new_state = {};
      new_state[obj_name] = true;
      this.setState(new_state);
    }
  }

  microphone_toggle(e) {
    if (media.tracks == undefined || media.tracks.audio == undefined) {
      let status = e.target.getAttribute("status");
      let child = e.target.children[0];

      if (child == undefined) {
        child = e.target;
      }

      event_loop({
        "type": "change-media",
        "mode": "audio",
        "status": false,
        "sender_id": self_id,
        "conn-id": "self"
      });
      child.setAttribute("src", "/static/icons/microphone-slash-solid.svg");
      let new_state = {};
      new_state["microphone"] = false;
      connection_manager.media_state["microphone"] = false;
      this.setState(new_state);
      return;
    }

    media.tracks.audio.enabled = !this.state["microphone"];
    connection_manager.toggle_tracks(!this.state["microphone"], "audio");
    let send_data = {
      "type": "change-media",
      "mode": "audio",
      "status": !this.state["microphone"],
      "sender_id": self_id
    };
    connection_manager.media_state["microphone"] = !this.state["microphone"];

    for (let connId in connection_manager.active_connections) {
      if (connId.startsWith("share-screen") == true) {
        continue;
      }

      let cnn = connection_manager.active_connections[connId];
      send_data["conn-id"] = connId;
      cnn.channel.send(JSON.stringify(send_data));
    }

    send_data["conn-id"] = "self";
    event_loop(send_data);
    this.toggle(e, "microphone");
  }

  video_toggle(e) {
    if (media.tracks == undefined || media.tracks.video == undefined) {
      let status = e.target.getAttribute("status");
      let child = e.target.children[0];

      if (child == undefined) {
        child = e.target;
      }

      event_loop({
        "type": "change-media",
        "mode": "video",
        "status": false,
        "sender_id": self_id,
        "conn-id": "self"
      });
      child.setAttribute("src", "/static/icons/video-slash-solid.svg");
      let new_state = {};
      new_state["video"] = false;
      connection_manager.media_state["video"] = false;
      this.setState(new_state);
      return;
    }

    connection_manager.toggle_tracks(!this.state["video"], "video");
    media.tracks.video.enabled = !this.state["video"];
    connection_manager.media_state["video"] = !this.state["video"];
    let send_data = {
      "type": "change-media",
      "mode": "video",
      "status": !this.state["video"],
      "sender_id": self_id
    };

    for (let connId in connection_manager.active_connections) {
      if (connId.startsWith("share-screen") == true) {
        continue;
      }

      let cnn = connection_manager.active_connections[connId];
      send_data["conn-id"] = connId;
      cnn.channel.send(JSON.stringify(send_data));
    }

    send_data["conn-id"] = "self";
    event_loop(send_data);
    this.toggle(e, "video");
  }

  chat_toggle(e) {
    if (this.state["comment"] == true) {
      if (this.state["mobile-view"] == true) {
        document.querySelector(".chat-block").setAttribute("class", "chat-block");
        document.querySelector(".video-block").setAttribute("style", "");
      } else {
        document.querySelector(".chat-block").setAttribute("class", "chat-block chat-block-close");
      }
    } else {
      if (this.state["mobile-view"] == true) {
        document.querySelector(".chat-block").setAttribute("class", "chat-block chat-block-open");
        document.querySelector(".video-block").setAttribute("style", "width: 0; min-width: 0;");
      } else {
        document.querySelector(".chat-block").setAttribute("class", "chat-block");
      }
    }

    this.toggle(e, "comment");
  }

  async create_screen_stream(stream, other_id) {
    let chat_id = "share-screen" + self_id;
    let rtc = new RTC();
    rtc.novideo = true;
    rtc.receiver_id = other_id;
    rtc.self_id = chat_id;
    let tracks = {};
    rtc.stream = stream;
    rtc.rtc.removeEventListener("track", rtc.ontrack_handler);
    stream.getTracks().forEach(function (track) {
      tracks[track.kind] = track;
      rtc.rtc.addTrack(track, stream);
    });
    rtc.tracks = tracks;
    let offer = await rtc.createOffer(chat_id + "||" + other_id);
    connection_manager.add_new_connections(rtc);
    return {
      "type": "offer",
      "offer": offer,
      "sender-id": chat_id,
      "receiver-id": other_id
    };
  }

  share_screen(e) {
    const self = this;

    if (this.state["share-screen"] == false) {
      navigator.mediaDevices.getDisplayMedia({
        "video": true,
        "audio": true
      }).then(async function (stream) {
        let tracks_list = stream.getTracks();
        let tracks = {};

        for (let i = 0; i < tracks_list.length; i++) {
          let t = tracks_list[i];

          if (tracks_list[i]["kind"] == "audio") {
            t.enabled = false;
          }

          tracks[tracks_list[i]["kind"]] = t;
        }

        document.dispatchEvent(new CustomEvent("new-media-connection", {
          detail: {
            "id": "self-share-screen",
            "tracks": tracks
          }
        }));
        media.screen_stream = stream;
        media.screen_stream.addEventListener("inactive", function (e) {
          document.dispatchEvent(new CustomEvent("close-media-connection", {
            detail: {
              id: "self-share-screen"
            }
          }));
          media.screen_stream = undefined;
        });

        for (let conn_id in connection_manager.active_connections) {
          let other_id = connection_manager.get_other_id(conn_id);

          if (other_id.indexOf("share-screen") != -1) {
            continue;
          }

          if (other_id == false) {
            continue;
          }

          let clone_stream = stream.clone();
          let response = await self.create_screen_stream(clone_stream, other_id);
          connection_manager.active_connections[conn_id].channel.send(JSON.stringify(response));
          stream.addEventListener("inactive", function (e) {
            let rtc_id = "share-screen" + self_id + "||" + other_id;
            let inactive_rtc = connection_manager.active_connections[rtc_id];
            media.screen_stream = undefined;

            try {
              inactive_rtc.rtc.close();
            } catch {}
          });
        } // send to event-loop -> change video track


        self.setState({
          "share-screen": stream
        });
      }).catch(function (err) {
        // send stop event-loop continue stream video
        self.setState({
          "share-screen": false
        });
      });
    } else {
      for (let id in connection_manager.active_connections) {
        if (id.startsWith("share-screen") != true) {
          continue;
        }

        let conn = connection_manager.active_connections[id];

        for (let kind in conn.tracks) {
          conn.tracks[kind].stop();
        }
      }

      let tracks = this.state["share-screen"].getTracks();
      tracks.forEach(track => track.stop());
      media.screen_stream = undefined; // send stop event-loop continue stream video

      self.setState({
        "share-screen": false
      });
    }
  }

  settings(e) {
    if (this.state["microphone"] == true) {
      document.querySelector("#mic").click();
    }

    if (this.state["video"] == true) {
      document.querySelector("#cam").click();
    }

    let settings_video = document.querySelector("#settings-video");

    if (media.tracks != undefined && media.tracks["video"] != undefined) {
      let video_track = media.tracks["video"].clone();
      video_track.enabled = true;
      let video_stream = new MediaStream([video_track]);
      settings_video.srcObject = video_stream;
    }

    if (media.tracks != undefined && media.tracks["audio"] != undefined) {
      let audio_track = media.tracks["audio"].clone();
      audio_track.enabled = true;
      let audio_stream = new MediaStream([audio_track]);
      microphone_visualize(audio_stream);
    }

    document.querySelector(".settings-modal").setAttribute("style", "display: block;");
  }

  stop_recording(from_child = true) {
    if (from_child == false) {
      this.state["record-screen"].stop_recording();
    }

    this.setState({
      "record-screen": false
    });
  }

  screen_record(e) {
    const self = this;

    if (this.state["record-screen"] == false) {
      navigator.mediaDevices.getDisplayMedia({
        "video": true,
        "audio": true
      }).then(function (stream) {
        let bridge_obj = new ManageHandler();

        function handler(e) {
          self.setState({
            "record-screen": e.detail
          });
          bridge_obj.removeEventListener("child-obj", handler);
        }

        bridge_obj.addEventListener("child-obj", handler);
        ReactDOM.render( /*#__PURE__*/React.createElement(RecordScreen, {
          parent_obj: self,
          bridge: bridge_obj,
          screen_stream: stream
        }), document.getElementById("record-controll"));

        stream.oninactive = function (e) {
          try {
            self.state["record-screen"].stop_recording(false);
          } catch {}

          self.setState({
            "record-screen": false
          });
        };
      }).catch(function (err) {
        self.setState({
          "record-screen": false
        });
      });
    }
  }

  componentDidMount() {
    this.change_size();
    let main_container = document.querySelector(".main-container");
    new ResizeObserver(this.change_size).observe(main_container);
    document.dispatchEvent(new Event("open-manage-button"));
  }

  render() {
    let record_screen_class = "";
    let share_screen_class = "";

    if (this.state["record-screen"] == false) {
      record_screen_class = "active";
    } else {
      record_screen_class = "disable";
    }

    if (this.state["share-screen"] == false) {
      share_screen_class = "active";
    } else {
      share_screen_class = "disable";
    }

    return /*#__PURE__*/React.createElement("div", {
      class: "settings-wrapper"
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      id: "mic",
      onClick: this.microphone_toggle,
      name: "button"
    }, /*#__PURE__*/React.createElement("img", {
      src: "/static/icons/microphone-solid.svg"
    })), /*#__PURE__*/React.createElement("button", {
      type: "button",
      id: "cam",
      onClick: this.video_toggle,
      name: "button"
    }, /*#__PURE__*/React.createElement("img", {
      src: "/static/icons/video-solid.svg"
    })), /*#__PURE__*/React.createElement("button", {
      type: "button",
      class: share_screen_class,
      onClick: this.share_screen,
      name: "button"
    }, /*#__PURE__*/React.createElement("img", {
      src: "/static/icons/desktop-solid.svg"
    })), /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: this.settings,
      name: "button"
    }, /*#__PURE__*/React.createElement("img", {
      src: "/static/icons/cog-solid.svg"
    })), /*#__PURE__*/React.createElement("button", {
      id: "comment",
      type: "button",
      onClick: this.chat_toggle,
      name: "button"
    }, /*#__PURE__*/React.createElement("img", {
      src: "/static/icons/comment-solid.svg"
    })), /*#__PURE__*/React.createElement("button", {
      type: "button",
      class: record_screen_class,
      onClick: this.screen_record,
      name: "button"
    }, /*#__PURE__*/React.createElement("img", {
      src: "/static/icons/record-vinyl-solid.svg"
    })), /*#__PURE__*/React.createElement("button", {
      type: "button",
      style: {
        display: "none"
      },
      id: "offer_view",
      name: "button"
    }, /*#__PURE__*/React.createElement("span", {
      id: "offer-counter"
    }), /*#__PURE__*/React.createElement("img", {
      src: "/static/icons/sign-in-alt-solid.svg"
    })));
  }

}

ReactDOM.render( /*#__PURE__*/React.createElement(ManageComponent, null), document.querySelector(".user-settings"));
