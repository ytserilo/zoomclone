class OfferComponent extends React.Component {
  constructor(props) {
    super(props);
    this.accept = this.accept.bind(this);
    this.denied = this.denied.bind(this);
  }

  accept() {
    const self = this;
    self.props.on_delete.dispatchEvent(new CustomEvent("delete", {
      detail: {
        id: self.props.user.id
      }
    }));
    document.dispatchEvent(new CustomEvent("accept-offer", {
      detail: {
        id: self.props.user.id
      }
    }));
  }

  denied() {
    const self = this;
    self.props.on_delete.dispatchEvent(new CustomEvent("delete", {
      detail: {
        id: self.props.user.id
      }
    }));
    document.dispatchEvent(new CustomEvent("cencell-offer", {
      detail: {
        id: self.props.user.id
      }
    }));
  }

  render() {
    let user = this.props.user;
    let photo = "/static/icons/unnamed.png";

    if (user.photo_url != null) {
      photo = user.photo_url;
    }

    let full_name = user.first_name + " " + user.last_name;
    full_name = full_name.replace("null", "");
    return /*#__PURE__*/React.createElement("div", {
      class: "offer-obj"
    }, /*#__PURE__*/React.createElement("img", {
      src: photo
    }), /*#__PURE__*/React.createElement("span", null, full_name), /*#__PURE__*/React.createElement("div", {
      class: "control-btns"
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      name: "button",
      onClick: this.accept
    }, "Accept"), /*#__PURE__*/React.createElement("button", {
      type: "button",
      name: "button",
      onClick: this.denied
    }, "Cencel")));
  }

}

class RoomManager extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      "offers": []
    };
    this.init = this.init.bind(this);
    this.init();
  }

  init() {
    const self = this;
    document.addEventListener("new-offer", function (e) {
      let data = e.detail;
      let event_target = new EventTarget();

      function onmessage(e) {
        for (let i = 0; i < self.state["offers"].length; i++) {
          if (self.state["offers"][i].props.user.id == e.detail.id) {
            self.state["offers"].splice(i, 1);
            self.setState({
              "offers": self.state["offers"]
            });
            event_target.removeEventListener("delete", onmessage);
          }
        }
      }

      event_target.addEventListener("delete", onmessage);
      let component = [true].map(item => {
        return /*#__PURE__*/React.createElement(OfferComponent, {
          on_delete: event_target,
          user: data.user
        });
      });
      self.state["offers"].push(component[0]);
      self.setState({
        "offers": self.state["offers"]
      });
    });
    document.addEventListener("delete-offer", function (e) {
      for (let i = 0; i < self.state["offers"].length; i++) {
        if (self.state["offers"][i].props.user.id == e.detail.id) {
          self.state["offers"].splice(i, 1);
          self.setState({
            "offers": self.state["offers"]
          });
          event_target.removeEventListener("delete", onmessage);
        }
      }
    });
  }

  shouldComponentUpdate(nextProps, nextState) {
    let cnt = nextState["offers"].length;
    document.querySelector("#offer-counter").innerText = String(cnt);
    return true;
  }

  render() {
    let empty = false;

    if (this.state["offers"].length == 0) {
      empty = true;
    }

    return /*#__PURE__*/React.createElement("div", {
      class: "offers"
    }, empty == false && /*#__PURE__*/React.createElement("span", null, this.state["offers"].map(function (item) {
      return item;
    })), empty && /*#__PURE__*/React.createElement("p", {
      style: {
        "text-align": "center",
        "margin-top": "50px"
      }
    }, "Nothing offers here"));
  }

}

ReactDOM.render( /*#__PURE__*/React.createElement(RoomManager, null), document.querySelector(".invent-modal"));
