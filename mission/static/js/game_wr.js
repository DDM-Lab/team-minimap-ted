var namespace = 'http://' + document.domain + ':' + location.port;
var socket = io(namespace, { path: '/ws/socket.io' });

var grid;
var cols;
var rows;
var width, height;
var w = 12;
var agentX;
var agentY;
var agentDirX;
var agentDirY;
var curX, curY;

const uid = document.getElementById("uid").value;
var groupID;


var numSteps = 0;
var traces = [];
var cost = 0;
var score = 0;
var block = 0;
var targetSteps = 0;

var isGameOver = false;


var countPress = 0;
var rescue = 0;
const timeDisplay = document.querySelector('#playtime');
var totalMinutes = 5 * 60;
var display = document.querySelector('#time');

// var episode=0;
var episode = document.getElementById("session").value;
var maxEpisode;
const episodeDisplay = document.getElementById('episode');

const dist = 2;
var listFoV = [];
var listYellow = [];
var minuteYellowDie = 0;
var secondYellowDie = 0;

var listRed = [];
var minuteRedDie = 3;
var secondRedDie = 0;

var iframe = document.getElementById('frame-qualtrics');
var closeBtn = document.getElementById('close-button');
var chkMap = document.querySelector('#map');
var chkFull = document.querySelector('#full_falcon');

var numRescuedGreen = 0;
var numRescuedYellow = 0;
var numRescuedRed = 0;
var otherX = [];
var otherY = [];
var roles = [];
var players = [];
var playerId;
var groupSize;
var roleName = '';
var roomid;
var medicImg;
var engineerImg;
var isFirst = true;
var intervalRecordData;
var intervalEmitSocket;

let socketIOBuffer = [];
let effortHis = [], skillHis = [], efficiencyHis = [];
var tedGraphs = {
  showEffort: true,//one or the other
  showScore : false,
  showSparkline: false, //C1
  showText : false, //C3

  showSkill: false,
  showEfficiency: false,
  showCI: false,
  showGauge: true,//C2

  showThreshold: true,



  effortData :[0,0,0,0,0,0,0,0,0,0],
  scoreData :[0,0,0,0,0,0,0,0,0,0],
  skillData :[0,0,0,0,0,0,0,0,0,0],
  efficiencyData :[0,0,0,0,0,0,0,0,0,0],
  ciData :[0,0,0,0,0,0,0,0,0,0],
  timeReference:[]
};

// waiting room
var lobbyWaitTime = 10 * 60 * 1000; //wait 10 minutes
window.intervalID = -1;
window.ellipses = -1
window.lobbyTimeout = -1;

// window.onload = function () {
//   showFullView(chkFull);
// };

function showElement(ElementId) {
  document.getElementById(ElementId).style.display = 'block';
}

function hideElement(ElementId) {
  document.getElementById(ElementId).style.display = 'none';
}

function showMap(chkMap) {
  if (chkMap.checked) {
    ISMAP = true;
  } else {
    DEBUG = false;
    ISMAP = false;
  }
}

function showFullView(chkFull) {
  if (chkFull.checked) {
    DEBUG = true;
  } else {
    DEBUG = false;
  }
}

function sendFailedSocketEmits() {
  if (socketIOBuffer.length > 0) {
    for (let i = 0; i < socketIOBuffer.length; i++) {
      emmitSocketIO(socketIOBuffer[i].endpoint, socketIOBuffer[i].value);
    }
  }
}

const withTimeout = (onSuccess, onTimeout, timeout) => {
  let called = false;

  const timer = setTimeout(() => {
    if (called) return;
    called = true;
    onTimeout();
  }, timeout);

  return (...args) => {
    if (called) return;
    called = true;
    clearTimeout(timer);
    onSuccess.apply(this, args);
  }
}

function emmitSocketIO(endpoint, value) {
  try {
    if (socket) {
      socket.emit(endpoint, value, withTimeout(
        () => { },
        () => {
          socketIOBuffer.push({ endpoint: endpoint, value: value })
        }, 1000));
    } else {
      socketIOBuffer.push({ endpoint: endpoint, value: value })
    }
  } catch (e) {
    socketIOBuffer.push({ endpoint: endpoint, value: value })
  }
}

socket.on("disconnect", (reason) => {
  sleep(5000).then(() => {
    if (socket.disconnected) {
      alert('The connection is not stable.');
    }
  });

  socket.emit('periodic call', { "pid": playerId, "x": agentX, "y": agentY, 'mission_time': display.textContent, 'event': '' })
  if (reason === "io server disconnect") {
    console.log('Io server disconnect')
    socket.connect();
  }
});

socket.on("connect_error", () => {
  setTimeout(() => {
    socket.connect();
  }, 1000);
});

socket.on("connect", () => {
  console.log("Is connected: ", socket.connected);
  sendFailedSocketEmits();
});


socket.on('end_lobby', function (msg) {
  if (msg['uid'] === playerId) {
    $("#finding_partner").text(
      "We were unable to find you a partner."
    );
    $("#error-exit").show();

    sleep(3000).then(() => { window.location.replace('https://cmu.ca1.qualtrics.com/jfe/form/SV_25F9jBZXFWevFd4'); });

    // Stop trying to join
    clearInterval(window.intervalID);
    clearInterval(window.ellipses);
    window.intervalID = -1;
    window.top.postMessage({ name: "timeout" }, "*");
  }
})

var countWait = 0;
socket.on('waiting', function (data) {
  $('#tab-panel').hide();
  $('#tabgame').hide();
  $('#lobby').show();
  $('#status').text(data['status'] + " / " + data['max_size']);
  if (parseInt(data['status']) != 0) {
    if (window.intervalID === -1) {
      // Occassionally ping server to try and join
      window.intervalID = setInterval(function () {
        emmitSocketIO('join', { "pid": playerId, "uid": uid });
      }, 1000);
    }
  }
  else if (parseInt(data['status']) === 0) {
    $("#finding_partner").text(
      "We were unable to find you a partner."
    );
    $("#error-exit").show();

    // Stop trying to join
    clearInterval(window.intervalID);
    clearInterval(window.ellipses);
  }
  if (window.lobbyTimeout === -1) {
    window.ellipses = setInterval(function () {
      var e = $("#ellipses").text();
      $("#ellipses").text(".".repeat((e.length + 1) % 10));
    }, 500);
    // Timeout to leave lobby if no-one is found
    window.lobbyTimeout = setTimeout(function () {
      emmitSocketIO('leave', {});
    }, lobbyWaitTime)
  }

});

startWaitTimer();

socket.on('connection response', function (msg) {
  roomid = msg['roomid'][playerId]
  console.log('room id', roomid)
  groupSize = Object.keys(msg['list_players'][roomid]).length;

  players = Object.keys(msg['list_players'][roomid]);

  for (const [key, value] of Object.entries(msg['list_players'][roomid])) {
    objVal = value;
    otherX.push(Object.values(objVal)[0]);
    otherY.push(Object.values(objVal)[1]);



    roles.push(Object.values(objVal)[2]);
    if (key == playerId) {
      roleName = Object.values(objVal)[2];
      // console.log("What is your role: ", roleName);

      emmitSocketIO('update', { "pid": playerId, "x": Object.values(objVal)[0], "y": Object.values(objVal)[1], 'mission_time': display.textContent, 'event': '' })

      groupID = parseInt(roomid);
      const isMyIndex = (myIndex) => myIndex == playerId;

      // document.getElementById('pid').innerHTML = 'Player id: ' + (players.findIndex(isMyIndex) + 1).toString() + ' | User id: ' + uid.toString();
      // document.getElementById('other_pid').innerHTML = ' | Your role: ' + roleName.toString() + ' | Group: ' + (groupID + 1).toString();
      if (groupID !== undefined && isFirst) {
        var initData = {
          "userid": uid, "group": groupID, "role": roleName, "episode": episode, "target": "", "target_pos": "",
          "num_step": 0, "time_spent": "start", "trajectory": ""
        };
        writeData(initData);
        isFirst = false;
      }
    }
  }
  getListPlayers();

});

socket.on('start game', function (msg) {
  if (window.intervalID !== -1) {
    clearInterval(window.intervalID);
    window.intervalID = -1;
  }
  if (window.lobbyTimeout !== -1) {
    clearInterval(window.ellipses);
    clearTimeout(window.lobbyTimeout);
    window.lobbyTimeout = -1;
    window.ellipses = -1;
  }
  clearInterval(timeout);


  // $('#tab-panel').show();
  $('#tabgame').show();
  $('#lobby').hide();

  $("#graphGaugesContainer").show();
  initializeTEDGraph();

  getMap();

  async function getMap() {
    const response = await fetch('/map');
    const data = await response.json();
    width = (parseInt(data["max_x"]) + 1) * w + 1;
    height = (parseInt(data["max_y"]) + 1) * w + 1;
    var canvas = createCanvas(width, height); //
    canvas.parent('sketch-holder');
    cols = floor(width / w);
    rows = floor(height / w);
    grid = make2DArray(cols, rows);
    for (var i = 0; i < cols; i++) {
      for (var j = 0; j < rows; j++) {
        grid[i][j] = new Cell(i, j, w);
      }
    }
    generateGrid(data["map_data"]);

    maxEpisode = parseInt(data["max_episode"]);

  }
  


  startTimer(totalMinutes, display);
  setTimeout(gameOver, totalMinutes * 1000);
  setTimeout(function () {
    for (var i in listYellow) {
      var posX = listYellow[i][0];
      var posY = listYellow[i][1];
      grid[posX][posY].goal = "";
    }
  }, (minuteYellowDie * 60 + secondYellowDie) * 1000);
  setTimeout(function () {
    for (var i in listRed) {
      var posX = listRed[i][0];
      var posY = listRed[i][1];
      grid[posX][posY].goal = "";
    }
  }, (minuteRedDie * 60 + secondRedDie) * 1000);

  //TED GRAPH
  setTimeout(function () {
    var newOpts = { ...opts };
    newOpts["staticZones"] = [
      { strokeStyle: "#88acd0", min: 0, max: 50 }, // Yellow
      {strokeStyle: "#2d74b3", min: 25, max: 100}, // Green
      //{strokeStyle: "#88acd0", min: 50, max: 100}

    ]
    console.log("Changing the skill and efficiency graphs threshold");
    tedGraphs.skillGaugeRef.setOptions(newOpts)
    tedGraphs.efficiencyGaugeRef.setOptions(newOpts);

  }, 1000 * 180);
  setTimeout(() => {
    // tedGraphs.effortGaugeRef.setOptions(opts);
    tedGraphs.skillGaugeRef.setOptions(opts);
    tedGraphs.efficiencyGaugeRef.setOptions(opts)
  }, totalMinutes * 1000);//reset at the end of the gameover

  //END TED GRAPH

  intervalRecordData = setInterval(function () {
    if (!isGameOver) {
      var data = {
        "userid": uid, "group": groupID, "role": roleName, "episode": episode, "target": "", "target_pos": "",
        "num_step": targetSteps, "time_spent": display.textContent, "trajectory": traces.join(";")
      };
      (async () => {
        writeData(data);
      })()
      targetSteps = 0;
      traces = [];
    } else {
      clearInterval(intervalRecordData);
    }
  }, 30 * 1000);
  intervalEmitSocket = setInterval(function () {
    if (!isGameOver) {
      emmitSocketIO('record', { "pid": playerId, "x": agentX, "y": agentY, 'mission_time': display.textContent, 'event': '' })
    }
    else {
      clearInterval(intervalEmitSocket);
    }
  }, 1000);

  if (!isGameOver) {

    setInterval(getListPlayers, 100);
    // setInterval(getTED, 10000); //call TED every 10s: 10000
    setInterval(getTED, 3000); //call TED every 10s: 10000
  }
}); //end socket on 'start game'



function setup() {
  console.log("Client socket: ", socket.id);
  playerId = uid;
  console.log('Client socket id:', playerId);

  emmitSocketIO("join", { "pid": playerId, "uid": uid });

  // load images
  // medicImg = loadImage("https://cdn-icons.flaticon.com/png/512/2371/premium/2371329.png?token=exp=1646427991~hmac=66091d24f0f77d7e5a90a48fd33dc6d9");
  medicImg = loadImage("https://raw.githubusercontent.com/ngocntkt/visualization-map/master/aid.png");
  engineerImg = loadImage("https://raw.githubusercontent.com/ngocntkt/visualization-map/master/hammer2.png");

  showElement("game-container");
  async function getEpisode() {
    const response = await fetch('/episode/' + uid + '/');
    const data = await response.json();
    episode = Number(data) + 1;
    episodeDisplay.textContent = 'Episode: ' + episode;
  }
  getEpisode();
  var canvas = createCanvas(0, 0);

  // initializeTEDGraph();
}//end-setup

/*
TED GRAPHS START
* */
function checkNumberOfBoxes() {
  if ($(".typeOfGraphBox:checked").length > 3) {
    alert("Only 3 graphs can be displayed !");
    return true;
  }
  return false;
}
var opts = {
  angle: 0, // The span of the gauge arc
  lineWidth: 0.2, // The line thickness
  radiusScale: 0.5, // Relative radius
  pointer: {
    length: 0.42, // // Relative to gauge radius
    strokeWidth: 0.038, // The thickness
    color: '#000000' // Fill color
  },
  limitMax: true,     // If false, max value increases automatically if value > maxValue
  limitMin: true,     // If true, the min value of the gauge will be fixed
  colorStart: '#6FADCF',   // Colors
  colorStop: '#8FC0DA',    // just experiment with them
  strokeColor: '#E0E0E0',  // to see which ones work best for you

  generateGradient: true,
  highDpiSupport: true,     // High resolution support
  staticZones: [
    //{strokeStyle: "#F03E3E", min: 1, max: 20}, // Red from 100 to 130
    { strokeStyle: "#88acd0", min: 0, max: 50 }, // Yellow
    { strokeStyle: "#2d74b3", min: 50, max: 100 }, // Green
    //{strokeStyle: "#FFDD00", min: 80, max: 100} // Yellow
  ],
};
var effortThreshold = 0;
function drawGauge(ref, data, obj) {
  if (obj == null) {
    /*obj = $(ref).epoch({
    type: 'time.gauge',
    value: 0
  });*/
    obj = new Gauge(document.getElementById(ref)).setOptions(opts);
    obj.set(data[data.length - 1]);
    return obj;
  } else {
    obj.set(data[data.length - 1]);
    //console.log(data[data.length - 1]);
    //obj.push(data[data.length-1]/10);
    return obj
  }

}
let widthz, heightz, gradient;
function getGradient(ctx, chartArea) {
  const chartWidth = chartArea.right - chartArea.left;
  const chartHeight = chartArea.bottom - chartArea.top;
  if (!gradient || widthz !== chartWidth || heightz !== chartHeight) {
    // Create the gradient because this is either the first render
    // or the size of the chart has changed
    widthz = chartWidth;
    heightz = chartHeight;
    gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
    gradient.addColorStop(0, 'rgb(255, 99, 132)');
    gradient.addColorStop(0.5, 'rgb(255, 205, 86)');
    gradient.addColorStop(1, 'green');
  }

  return gradient;
}
const options = {
      plugins: {
        autocolors: false,
        annotation: {
          annotations: {
            line1: {
              type: 'line',
              yMin: 50,
              yMax: 50,
              borderColor: 'rgb(0, 0, 0)',
              borderWidth: 2,
              borderDashOffset : 0,
              borderDash: [5,7]
            },/*
            line2: {
              type: 'line',
              yMin: 100,
              yMax: 100,
              borderColor: 'rgb(255, 99, 132)',
              borderWidth: 2,
            }*/
          }
        },
        /*customCanvasBackgroundColor: {
            color: 'rgba(0,0,0,0.4)'
        },*/
        legend: {
          display: false
        }
  },
  scales: {
    x: {
        type: 'timeseries',//timeseries
        time: {
            displayFormats: {
                second : 'mm:ss'
            },
             unit: 'second'
        },
        grid: {
          color: "#ffffff",
          display:false
        },
        ticks: {
          color: "#ffffff", // this here
          display:false
        }
    },
    y: {
        type: 'linear',
        min: 0,
        max: 100,
        position: 'right',
        grid: {
          color: "#ffffff",
          display:false,
            borderColor: function(context) {
                const chart = context.chart;
                const {ctx, chartArea} = chart;

                if (!chartArea) {
                  // This case happens on initial chart load
                  return;
                }
                return getGradient(ctx, chartArea);
            },
            borderWidth: 5
        },

    },

  }
};
/*
const plugin = {
  id: 'customCanvasBackgroundColor',
  beforeDraw: (chart, args, options) => {
    const {ctx} = chart;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = options.color || '#99ffff';
    ctx.fillRect(0, 0, chart.width, chart.height);
    ctx.restore();
  }
};

Chart.register(plugin);

 */

const initialDateRef = new Date();


const closestZeroMinutesDate = new Date(
    initialDateRef.getFullYear(),
    initialDateRef.getMonth(),
    initialDateRef.getDate(),
    initialDateRef.getHours(),00);


function adjustTimeToZeroMinutes(dt){
    const dif = dt.getTime() - initialDateRef.getTime();

    let a = new Date()
    a.setTime(closestZeroMinutesDate.getTime() + dif);
    //console.log(dif);
    //console.log({a})
    return a;
}

for(var i=0;i<10;i++){
    tedGraphs.timeReference.push(adjustTimeToZeroMinutes(new Date()));

}
function drawSparkline(ref,data, obj){
    let labelRef = ref.replace("liveChart","");
    const config = {
  type: 'line',
  data: {
    datasets: [{
      label: labelRef,
      backgroundColor: "rgba(159,170,174,0.8)",
      data: [{x: closestZeroMinutesDate, y : 1}],
      fill: false,
      borderColor: "rgba(55,109,192,1)",
      pointBorderColor: "rgba(55,109,192,1)",
      pointBackgroundColor: "rgba(55,109,192,1)",//"#fff",
      tension: 0.5
    }]
  },
  options
};

    if(tedGraphs.showSparkline && tedGraphs.showThreshold) {
        if(obj==null){
            const ctx = document.getElementById(ref);
            obj = new Chart(ctx, config);
        } else {

            obj.data.datasets.forEach((dataset) => {
                const dataArray = [];
                    for(var i=0;i<data.length; i++) {
                         dataArray.push({x: tedGraphs.timeReference[i], y:data[i]*10})//*10
                    }
                    dataset.data = dataArray;
            });
            obj.update();
        }
        return obj;

    } else {
        if(tedGraphs.showSparkline){
            if(obj==null){
                const ctx = document.getElementById(ref);
                obj = new Chart(ctx, config);
            } else {

                obj.data.datasets.forEach((dataset) => {
                    const dataArray = [];
                    for(var i=0;i<data.length; i++) {
                         dataArray.push({x: tedGraphs.timeReference[i], y:data[i]})
                    }

                    dataset.data = dataArray;
                });
                obj.update();
            }
            return obj;
        }
    }

}
function drawGraphs() {
  if (tedGraphs.showEffort && tedGraphs.showSparkline) {
    /*if(tedGraphs.showGauge) {
      tedGraphs.effortGaugeRef = drawGauge("gaugeChartEffort", tedGraphs.effortData, tedGraphs.effortGaugeRef)
    }*/
    tedGraphs.effortGraphRef = drawSparkline("liveChartEffort",tedGraphs.effortData, tedGraphs.effortGraphRef);
  }
  if(tedGraphs.showEffort && tedGraphs.showGauge) {
      tedGraphs.effortGaugeRef = drawGauge("gaugeChartEffort", tedGraphs.effortData, tedGraphs.effortGaugeRef)
    }
  if(tedGraphs.showScore && tedGraphs.showSparkline){
    tedGraphs.scoreGraphRef = drawSparkline("liveChartScore",tedGraphs.scoreData, tedGraphs.scoreGraphRef);
  }
  // if(!tedGraphs.showSparkline && tedGraphs.showEffort){
  //   let rescue = tedGraphs.effortData[tedGraphs.effortData.length -1];
  //
  //   document.getElementById('effort').innerHTML = 'Effort: ' + rescue.toString();
  // }
  // if(!tedGraphs.showSparkline && tedGraphs.showScore){
  //   let rescue = tedGraphs.scoreData[tedGraphs.scoreData.length -1];
  //   document.getElementById('goal').innerHTML = 'Points: ' + rescue.toString();
  // }
  /*
  if (tedGraphs.showSkill) {
    if(tedGraphs.showGauge) {
      tedGraphs.skillGaugeRef = drawGauge("gaugeChartSkill", tedGraphs.skillData, tedGraphs.skillGaugeRef)
    }
    tedGraphs.skillGraphRef = drawSparkline("liveChartSkill",tedGraphs.skillData,tedGraphs.skillGraphRef);
  }
  if (tedGraphs.showEfficiency) {
    if(tedGraphs.showGauge) {
      tedGraphs.efficiencyGaugeRef = drawGauge("gaugeChartEfficiency", tedGraphs.efficiencyData, tedGraphs.efficiencyGaugeRef)
    }
    tedGraphs.efficiencyGraphRef = drawSparkline("liveChartEfficiency",tedGraphs.efficiencyData, tedGraphs.efficiencyGraphRef);
  }
  if (tedGraphs.showCI) {
    if(tedGraphs.showGauge) {
      tedGraphs.ciGaugeRef = drawGauge("gaugeChartCI", tedGraphs.ciData, tedGraphs.ciGaugeRef)
    }
    tedGraphs.ciGraphRef = drawSparkline("liveChartCI",tedGraphs.ciData,tedGraphs.ciGraphRef);
  }
   */
}

var isInfoHidden = true;
function setupInformationPanelToggle() {
  $(function () {
    $("#instructionsToggle").click(function () {

      if (!isInfoHidden) {
        $("#tab-panel").slideUp();
        $(this).text("Show commands");
        isInfoHidden = true;
      } else {
        $("#tab-panel").slideDown();
        $(this).text("Hide commands");
        isInfoHidden = false;
      }
    });
  });
}
function hideTEDGraphs() {
  $(".effortCharts").hide();
  $(".skillCharts").hide();
  $(".efficiencyCharts").hide();
  $(".ciCharts").hide();
  $("#graphGaugesContainer").hide();
}
setupInformationPanelToggle();
function initializeTEDGraph() {
  // $(function () {

  //   $("#effortBox").click(function (e) {
  //     if (checkNumberOfBoxes()) { e.stopPropagation(); e.preventDefault(); return false; }
  //     $(".effortCharts").toggle(this.checked);
  //     tedGraphs.showEffort = this.checked;
  //     drawGraphs();
  //   });
  //   $("#skillBox").click(function (e) {
  //     if (checkNumberOfBoxes()) { e.stopPropagation(); e.preventDefault(); return false; }
  //     $(".skillCharts").toggle(this.checked);
  //     tedGraphs.showSkill = this.checked;
  //     drawGraphs();
  //   });
  //   $("#efficiencyBox").click(function (e) {
  //     if (checkNumberOfBoxes()) { e.stopPropagation(); e.preventDefault(); return false; }
  //     $(".efficiencyCharts").toggle(this.checked);
  //     tedGraphs.showEfficiency = this.checked;
  //     drawGraphs();
  //   });
  //   $("#ciBox").click(function (e) {
  //     if (checkNumberOfBoxes()) { e.stopPropagation(); e.preventDefault(); return false; }
  //     $(".ciCharts").toggle(this.checked);
  //     tedGraphs.showCI = this.checked;
  //     drawGraphs();
  //   });
  //
  //   $("#showGauge").click(function (e) {
  //     $(".graphGauge").toggle(this.checked);
  //     tedGraphs.showGauge = this.checked;
  //     drawGraphs();
  //   });
  //   $("#showGraph").click(function (e) {
  //     $(".sparkLine").toggle(this.checked);
  //     $("#showThreshold").prop("disabled", !this.checked);
  //     tedGraphs.showSparkline = this.checked;
  //     drawGraphs();
  //   });
  //   $("#showThreshold").click(function (e) {
  //     tedGraphs.showThreshold = this.checked;
  //     drawGraphs();
  //   });
  // });
  if(!tedGraphs.showSparkline && tedGraphs.showEffort){$('#effort').show();}
  drawGraphs();//to auto start the graphs
}
const NUMBER_OF_POINTS = 10;
function checkGraphDataBoundaries() {
  if (tedGraphs.effortData.length > NUMBER_OF_POINTS) {
    //clean up data.
    tedGraphs.effortData = tedGraphs.effortData.slice(tedGraphs.effortData.length - NUMBER_OF_POINTS, tedGraphs.effortData.length)
    //tedGraphs.scoreData =  tedGraphs.scoreData.slice(tedGraphs.scoreData.length - NUMBER_OF_POINTS, tedGraphs.scoreData.length)

    /*tedGraphs.skillData = tedGraphs.skillData.slice(tedGraphs.skillData.length - NUMBER_OF_POINTS, tedGraphs.skillData.length)
    tedGraphs.efficiencyData = tedGraphs.efficiencyData.slice(tedGraphs.efficiencyData.length - NUMBER_OF_POINTS, tedGraphs.efficiencyData.length)
    tedGraphs.ciData = tedGraphs.ciData.slice(tedGraphs.ciData.length - NUMBER_OF_POINTS, tedGraphs.ciData.length)*/

    tedGraphs.timeReference = tedGraphs.timeReference.slice(tedGraphs.timeReference.length - NUMBER_OF_POINTS, tedGraphs.timeReference.length);

  }
}
console.log("VERSION 1.13.2");
/*
TED GRAPHS END
* */

getTED.calledTimes = 0;
socket.on('ted response', function (msg) {

  pos_element = getTED.calledTimes;
  //console.log("GOT TED VALUES : " + pos_element + "  -  " + msg['ted_players'].length);
  //console.log(msg);
  var tedPlayersLength = msg['ted_players'].length - 1;

  if (msg['ted_players'][tedPlayersLength] != undefined &&
    msg['ted_players'][tedPlayersLength] != null &&
    Object.keys(msg['ted_players'][tedPlayersLength]).length > 0) {

    console.log(msg['ted_players'][tedPlayersLength]);
    var effortValue = parseFloat(msg['ted_players'][tedPlayersLength]['Effort']) * 100 *10;

    //var pointsValue = parseFloat(['ted_players'][tedPlayersLength]['points']) * 100;
    //console.log('Effort value', effortValue);

    /*var skillValue = parseFloat(msg['ted_players'][tedPlayersLength]['Skill']) * 1000;
    //console.log('Skill value', skillValue);
    var efficiencyValue = parseFloat(msg['ted_players'][tedPlayersLength]['Workload']) * 1000;
    //console.log('Efficiency value', efficiencyValue);
    var ciValue = efficiencyValue + skillValue + effortValue;*/


    if(pos_element % 4 == 0) {

      tedGraphs.effortData.push((effortValue !== undefined && !isNaN(effortValue)) ? ((effortValue>100)?(100):(effortValue)) : (0))
      //tedGraphs.scoreData.push((pointsValue !== undefined && !isNaN(pointsValue)) ? ((pointsValue>100)?(100):(pointsValue)) : (0))
      //tedGraphs.skillData.push((skillValue !== undefined && !isNaN(skillValue)) ? (skillValue) : (0))
      //tedGraphs.efficiencyData.push((efficiencyValue !== undefined && !isNaN(efficiencyValue)) ? (efficiencyValue) : (0))
      //tedGraphs.ciData.push((ciValue !== undefined && !isNaN(ciValue)) ? (ciValue) : (0));
      const dt = new Date();
      dt.setTime(tedGraphs.timeReference[tedGraphs.timeReference.length -1 ].getTime() + 3*1000);
      tedGraphs.timeReference.push(dt);

      checkGraphDataBoundaries();
      drawGraphs();
    }

    //console.log("Effort: ", msg['ted_players'][pos_element]['process_effort_s']);
    //effortHis.push(msg['ted_players'][pos_element]['process_effort_s'])
    //console.log("Skill: ", msg['ted_players'][pos_element]['process_skill_use_s']);
    // console.log("Coverage: ", msg['ted_players'][pos_element]['process_coverage']);
    //console.log('Efficiency: ', msg['ted_players'][pos_element]['process_workload_burnt']);
    /*
    document.getElementById('effort').innerHTML = 'Effort: ' + parseFloat(msg['ted_players'][pos_element]['process_effort_s']).toFixed(2);
    document.getElementById('skill').innerHTML = 'Skill: ' + parseFloat(msg['ted_players'][pos_element]['process_skill_use_s']).toFixed(2);
    document.getElementById('efficiency').innerHTML = 'Efficiency: ' + parseFloat(msg['ted_players'][pos_element]['process_workload_burnt']).toFixed(2);
    */
    var nowTime = Date.now();

    var effInt = [];
    var forStartValue = 0;

    //console.log("Lengh history effort: "  + effortHis.length);
    //console.log("new value:" +msg['ted_players'][pos_element]['Effort'] * 100);
    //tedChart.historyEff.push(msg['ted_players'][pos_element]['Effort'] * 100)


  } else {
    //console.log(msg['ted_players'][pos_element].length)
    //console.log("Hmm: ", msg['ted_players'][pos_element]);
    effortHis.push(0)
    tedGraphs.effortData.push(0)
    //tedGraphs.scoreData.push(0)
    //tedGraphs.skillData.push(0)
    //tedGraphs.efficiencyData.push(0)
    //tedGraphs.ciData.push(0);
    checkGraphDataBoundaries();
  }

  getTED.calledTimes++;
});
function getTED() {
  emmitSocketIO('ted', { "pid": playerId, "x": agentX, "y": agentY, 'mission_time': display.textContent, 'event': '' })
}

function getListPlayers() {
  if (!isGameOver) {
    emmitSocketIO('periodic call', {
      "pid": playerId,
      "x": agentX,
      "y": agentY,
      'mission_time': display.textContent,
      'event': ''
    });
  }
}

socket.on('heartbeat', function (msg) {
  for (var k = 0; k < players.length; k++) {
    if (players[k] !== undefined) {
      var pid = players[k];
      otherX[k] = parseInt(msg[pid]['x']);
      otherY[k] = parseInt(msg[pid]['y']);
      roles[k] = msg[pid]['role'].toString();
      updateEnvironment(otherX[k], otherY[k]);
    }
  }
});

socket.on('on change', function (msg) {
  players = Object.keys(msg['list_players']);
  for (var k = 0; k < players.length; k++) {
    if (players[k] !== undefined) {
      var pid = players[k];
      otherX[k] = parseInt(msg['list_players'][pid]['x']);
      otherY[k] = parseInt(msg['list_players'][pid]['y']);
      // roles[k] = msg['list_players'][roomid][pid]['role'].toString();
      updateEnvironment(otherX[k], otherY[k]);
      updateScoreBoard(msg['score']['green'], msg['score']['yellow'], msg['score']['red']);
    }
  }
});

socket.on('leave', function (msg) {
  var idx = players.indexOf(msg['pid'])
  if (idx != -1) {
    delete players[idx];
  }
});
// }//end getListPlayer

function updateScoreBoard(green, yellow, red) {
  rescue = green * 10 + yellow * 30 + red * 60;
  numRescuedGreen = green;
  numRescuedYellow = yellow;
  numRescuedRed = red;

  document.getElementById('goal').innerHTML = 'Points: ' + rescue.toString();

  document.getElementById('green').innerHTML = 'Green: ' + numRescuedGreen.toString();
  document.getElementById('yellow').innerHTML = 'Yellow: ' + numRescuedYellow.toString();
  document.getElementById('red').innerHTML = 'Red: ' + numRescuedRed.toString();
  tedGraphs.scoreData.push(rescue);

}

function updateEnvironment(loc_x, loc_y) {
  if (grid[loc_x]&&grid[loc_x][loc_y]?.goal == 'yellow') {
    grid[loc_x][loc_y].goal = "";
    emmitSocketIO('periodic call', { "pid": playerId, "x": agentX, "y": agentY, 'mission_time': display.textContent, 'event': 'yellow' })
  }
  else if (grid[loc_x]&& grid[loc_x][loc_y]?.goal == 'green') {
    grid[loc_x][loc_y].goal = "";
    emmitSocketIO('periodic call', { "pid": playerId, "x": agentX, "y": agentY, 'mission_time': display.textContent, 'event': 'green' })
  }

  else if (grid[loc_x] && grid[loc_x][loc_y]?.goal == 'red') {
    grid[loc_x][loc_y].goal = "";
    emmitSocketIO('periodic call', { "pid": playerId, "x": agentX, "y": agentY, 'mission_time': display.textContent, 'event': 'red' })
  }

  else if (grid[loc_x] && grid[loc_x][loc_y]?.goal == 'door') {
    console.log('Hit door...');
    grid[loc_x][loc_y].goal = ''

    emmitSocketIO('periodic call', { "pid": playerId, "x": agentX, "y": agentY, 'mission_time': display.textContent, 'event': 'door' })
  }
  else if (grid[loc_x] && grid[loc_x][loc_y]?.goal == 'rubble') {
    grid[loc_x][loc_y].goal = ''
    emmitSocketIO('periodic call', { "pid": playerId, "x": agentX, "y": agentY, 'mission_time': display.textContent, 'event': 'rubble' })
  }
}

function generateGrid(data) {
  size = Object.keys(data).length;
  for (let entry of Object.entries(data)) {
    var type = entry[1]['key'];
    var posX = Number(entry[1]['x']);
    var posY = Number(entry[1]['z']);
    grid[posX][posY].goal = type;
    grid[posX][posY].prev = type;

    if (type == "yellow") {
      listYellow.push([posX, posY]);
    }
    if (type == "red") {
      listRed.push([posX, posY]);
    }
    else if (type == "agent") {
      console.log(" >>> " + posX + " - " + posY);
      agentX = posX;
      agentY = posY;
      agentDirX = 0;
      agentDirY = 0;
    }

  }

  traces.push("(" + agentX + "," + agentY + ")");
  emmitSocketIO('start', { "pid": playerId, 'uid': uid, "x": agentX, "y": agentY, 'mission_time': display.textContent, 'event': 'start mission' })
}

function gameOver() {
  hideTEDGraphs();
  isGameOver = true;
  clearInterval(timeout);
  clearInterval(intervalRecordData);
  clearInterval(intervalEmitSocket);

  console.log("Game over");
  timeDisplay.textContent = "GAME OVER !";

  var data = {
    "userid": uid, "group": groupID, "role": roleName, "episode": episode, "target": "", "target_pos": "",
    "num_step": targetSteps, "time_spent": "stop", "trajectory": traces.join(";")
  };
  writeData(data);

  emmitSocketIO('end', { "pid": playerId, 'uid': uid, 'gid': groupID, "x": agentX, "y": agentY, 'mission_time': display.textContent, 'event': 'end mission', 'episode': episode })

  async function getTotalPoint() {
    const response = await fetch('/points/' + uid + '/');
    const data = await response.json();
    console.log(data)
    $('#tab-panel').hide();
    $('#tabgame').hide();
    $('#notification').show();

    var h2 = $('h2', '.notification');
    $("div#notification h2").text(
      "Total points of your team is: " + data
    );
    $("#notification-content").text(
      "You have finished playing the game. You will be forwarded to the post-study section in a few seconds."
    );
  }

  if (episode == maxEpisode) {
    // showElement("finish-button");
    var button = document.getElementById('finish-button');
    sleep(3000).then(() => {
      getTotalPoint();
    });
    sleep(5000).then(() => { button.click(); });

  } else {
    var button = document.getElementById('next-button');
    sleep(2000).then(() => {
      $('#tab-panel').hide();
      $('#tabgame').hide();
      $('#notification').show();
    });
    sleep(5000).then(() => { button.click(); });
  }
}

function writeData(data) {
  const dataOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  };
  fetch('/game_play', dataOptions);
}

function draw() {
  // background(200,200,200,127);
  background(173, 216, 230, 127);

  for (var i = 0; i < cols; i++) {
    for (var j = 0; j < rows; j++) {
      for (var k = 0; k < players.length; k++) {
        if (players[k] != undefined) {
          if (players[k] == playerId) {
            if (i == agentX && j == agentY) {
              grid[i][j].agent = true;
              // grid[i][j].addMyAgent((k+1).toString());
              grid[i][j].addAgentImage(roles[k]);
              grid[i][j].goal = roles[k];
            }
          } else {
            if (i == otherX[k] && j == otherY[k]) {
              grid[i][j].other_agent = true;
              grid[i][j].addOtherAgentImg(roles[k]);
              grid[i][j].goal = roles[k];
            }
          }
        }
      }

      if (isFoV(i, j, dist)) {
        listFoV.push("(" + i + "," + j + ")");
      }
      showFoV(i, j, dist);
      grid[i][j].show();
    }
  }

  if (!isGameOver) {
    if (keyIsDown(UP_ARROW) && keyIsDown(88)) {
      countPress = 0;
      curX = agentX;
      if (agentY == 1) {
        curY = agentY;
      } else {
        curY = agentY - 1;
      }
      checkBoundary(curX, curY);
    } else if (keyIsDown(DOWN_ARROW) && keyIsDown(88)) {
      countPress = 0;
      curX = agentX;
      if (agentY == 49) {
        curY = agentY;
      } else {
        curY = agentY + 1;
      }
      checkBoundary(curX, curY);
    }
    else if (keyIsDown(LEFT_ARROW) && keyIsDown(88)) {
      countPress = 0;
      curY = agentY;
      if (agentX == 0) {
        curX = agentX;
      } else {
        curX = agentX - 1;
      }
      checkBoundary(curX, curY);
    } else if (keyIsDown(RIGHT_ARROW) && keyIsDown(88)) {
      countPress = 0;
      curY = agentY;
      if (agentX == 92) {
        curX = agentX;
      } else {
        curX = agentX + 1;
      }
      checkBoundary(curX, curY);
    }
  }
}

var startSpeedUp = false;

let keysPressed = {};
let keyVal;
function keyPressed() {
  if (!isGameOver) {
    if (keyIsDown(88) && !startSpeedUp) {
      if (keyCode === UP_ARROW || keyCode === DOWN_ARROW || keyCode === LEFT_ARROW || keyCode === RIGHT_ARROW) {
        keysPressed[keyCode] = true;
        keyVal = keyCode;
        startSpeedUp = true;
        emmitSocketIO('record', { "pid": playerId, "x": agentX, "y": agentY, 'mission_time': display.textContent, 'event': 'start speedup' })
        // console.log('Start speedup');
      }
    }
    if (keyCode === UP_ARROW) {
      countPress = 0;
      curX = agentX;
      if (agentY == 1) {
        curY = agentY;
      } else {
        curY = agentY - 1;
      }
    } else if (keyCode === DOWN_ARROW) {
      countPress = 0;
      curX = agentX;
      if (agentY == 49) {
        curY = agentY;
      } else {
        curY = agentY + 1;
      }
    }
    if (keyCode === LEFT_ARROW) {
      countPress = 0;
      curY = agentY;
      if (agentX == 0) {
        curX = agentX;
      } else {
        curX = agentX - 1;
      }
    } else if (keyCode === RIGHT_ARROW) {
      countPress = 0;
      curY = agentY;
      if (agentX == 92) {
        curX = agentX;
      } else {
        curX = agentX + 1;
      }
    }
    if (keyCode === ENTER) {
      countPress += 1;
      // Record triage in progress when the player presses a streak of Enter keys...
      var options = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var i = 0; i < options.length; i++) {
        var tmpX = agentX + options[i][0];
        var tmpY = agentY + options[i][1];

        if (grid[tmpX][tmpY].goal == 'red') {
          if (roleName == "medic") {
            if (countPress > 1) {
              emmitSocketIO('record', { "pid": playerId, "x": agentX, "y": agentY, 'mission_time': display.textContent, 'event': 'triage red in-progress' })
              // console.log('Triage Red in-progress');
            }
            if (countPress == 20) {
              console.log("Find red...");
              // checking if there is an engineering teammate around
              for (var j = 0; j < options.length; j++) {
                neededX = tmpX + options[j][0];
                neededY = tmpY + options[j][1];
                if (grid[neededX][neededY].goal == "engineer") {
                  break;
                }
              }
              // console.log("Around: ", grid[neededX][neededY].goal);
              if (grid[neededX][neededY].goal == "engineer") {
                console.log("Yeah, find one...");
                curX = tmpX;
                curY = tmpY;
                grid[curX][curY].goal = "";
                rescue += 60;
                document.getElementById('goal').innerHTML = 'Points: ' + rescue.toString();
                numRescuedRed += 1;
                document.getElementById('red').innerHTML = 'Red: ' + numRescuedRed.toString();
                var targetPos = [curX, curY];
                var data = {
                  "userid": uid, "group": groupID, "role": roleName, "episode": episode, "target": "red_victim", "target_pos": targetPos.toString(),
                  "num_step": targetSteps, "time_spent": display.textContent, "trajectory": traces.join(";")
                };
                writeData(data);
                emmitSocketIO('record', { "pid": playerId, "x": agentX, "y": agentY, 'mission_time': display.textContent, 'event': 'red' })
                targetSteps = 0;
              }
              countPress = 0;
            }//endif countPress

          } else { //engineer cannot do anything
            console.log("Nothing you can do! ");
          }
          break;
        }

        else if (grid[tmpX][tmpY].goal == 'door') {
          if (roleName == "engineer") {
            curX = tmpX;
            curY = tmpY;
            grid[curX][curY].goal = "";
            var targetPos = [curX, curY];
            var data = {
              "userid": uid, "group": groupID, "role": roleName, "episode": episode, "target": "door", "target_pos": targetPos.toString(),
              "num_step": targetSteps, "time_spent": display.textContent, "trajectory": traces.join(";")
            };
            writeData(data);
            targetSteps = 0;
            traces = [];
            emmitSocketIO('record', { "pid": playerId, "x": agentX, "y": agentY, 'mission_time': display.textContent, 'event': 'door' })
            break;
          }//endif engineer - only engineer can open door
        }
        else if (grid[tmpX][tmpY].goal == 'green') {
          if (countPress > 1) {
            emmitSocketIO('record', { "pid": playerId, "x": agentX, "y": agentY, 'mission_time': display.textContent, 'event': 'triage green in-progress' })
          }
          if (countPress == 10) {
            curX = tmpX;
            curY = tmpY;
            grid[curX][curY].goal = "";
            countPress = 0;
            rescue += 10;
            document.getElementById('goal').innerHTML = 'Points: ' + rescue.toString();
            numRescuedGreen += 1;
            document.getElementById('green').innerHTML = 'Green: ' + numRescuedGreen.toString();
            var targetPos = [curX, curY];
            var data = {
              "userid": uid, "group": groupID, "role": roleName, "episode": episode, "target": "green_victim", "target_pos": targetPos.toString(),
              "num_step": targetSteps, "time_spent": display.textContent, "trajectory": traces.join(";")
            };
            writeData(data);
            emmitSocketIO('record', { "pid": playerId, "x": agentX, "y": agentY, 'mission_time': display.textContent, 'event': 'green' })
            targetSteps = 0;
            traces = [];
            // socket.emit('state update', {"type": "green", "x" : curX, "y" : curY});
            break;

          }
        }
        else if (grid[tmpX][tmpY].goal == 'yellow') {
          if (roleName == "medic") {
            if (countPress > 1) {
              // console.log('Triage Yellow in-progress');
              emmitSocketIO('record', { "pid": playerId, "x": agentX, "y": agentY, 'mission_time': display.textContent, 'event': 'triage yellow in-progress' })
            }
            if (countPress == 20) {
              curX = tmpX;
              curY = tmpY;
              grid[curX][curY].goal = "";
              countPress = 0;
              rescue += 30;
              document.getElementById('goal').innerHTML = 'Points: ' + rescue.toString();
              numRescuedYellow += 1;
              document.getElementById('yellow').innerHTML = 'Yellow: ' + numRescuedYellow.toString();
              var targetPos = [curX, curY];
              var data = {
                "userid": uid, "group": groupID, "role": roleName, "episode": episode, "target": "yellow_victim", "target_pos": targetPos.toString(),
                "num_step": targetSteps, "time_spent": display.textContent, "trajectory": traces.join(";")
              };
              writeData(data);
              emmitSocketIO('record', { "pid": playerId, "x": agentX, "y": agentY, 'mission_time': display.textContent, 'event': 'yellow' })
              targetSteps = 0;
              traces = [];
              // socket.emit('state update', {"type": "yellow", "x" : curX, "y" : curY});
              break;
            }
          }//endif medic - only medic can save
        }
        else if (grid[tmpX][tmpY].goal == 'rubble') {
          if (roleName == "engineer") {
            if (countPress > 1) {
              // console.log('Clear Rubble in-progress');
              emmitSocketIO('record', { "pid": playerId, "x": agentX, "y": agentY, 'mission_time': display.textContent, 'event': 'clear rubble in-progress' })
            }
            if (countPress == 5) {
              curX = tmpX;
              curY = tmpY;
              grid[curX][curY].goal = "";
              var targetPos = [curX, curY];
              var data = {
                "userid": uid, "group": groupID, "role": roleName, "episode": episode, "target": "rubble", "target_pos": targetPos.toString(),
                "num_step": targetSteps, "time_spent": display.textContent, "trajectory": traces.join(";")
              };
              writeData(data);
              emmitSocketIO('record', { "pid": playerId, "x": agentX, "y": agentY, 'mission_time': display.textContent, 'event': 'rubble' })
              targetSteps = 0;
              traces = [];
              break;
            }
          }//endif engineer - only engineer can clear rubble
        }
      }
    }
  }
}

function keyReleased() {
  if (!isGameOver) {
    if (keyCode === 88) {
      if (keysPressed[UP_ARROW] || keysPressed[DOWN_ARROW] || keysPressed[LEFT_ARROW] || keysPressed[RIGHT_ARROW]) {
        delete keysPressed[keyVal];
        startSpeedUp = false;
        // console.log('End speedup');
        emmitSocketIO('record', { "pid": playerId, "x": agentX, "y": agentY, 'mission_time': display.textContent, 'event': 'end speedup' })
      }

    }
    checkBoundary(curX, curY);
  }
}

function checkBoundary(paraX, paraY) {
  if (grid[paraX] != undefined && grid[paraX][paraY] != undefined && (
    grid[paraX][paraY].goal == 'wall' || grid[paraX][paraY].goal == 'door' || grid[paraX][paraY].goal == 'yellow' ||
    grid[paraX][paraY].goal == 'green' || grid[paraX][paraY].goal == 'rubble' ||
    grid[paraX][paraY].goal == 'red')) {
    paraX = agentX;
    paraY = agentY;
  }
  else {
    for (var k = 0; k < players.length; k++) {
      if (players[k] != undefined) {
        if (players[k] != playerId) {
          if (paraX == otherX[k] && paraY == otherY[k]) {
            paraX = agentX;
            paraY = agentY;
          }
        }
      }

    }
    if (paraX !== undefined && paraY !== undefined) {
      if (agentX != paraX || agentY != paraY) {
        agentDirX = agentX - paraX
        agentDirY = agentY - paraY
        agentX = paraX;
        agentY = paraY;

        numSteps += 1;
        targetSteps += 1;
        console.log(">> " + paraX + "- " + paraY);

        traces.push("(" + agentX + "," + agentY + ")");
        listFoV = [];
      }
   }
  }
  emmitSocketIO('update', { "pid": playerId, "x": agentX, "y": agentY, 'mission_time': display.textContent, 'event': '' })
}

function getAction(dx, dy) {
  if (dx == 0 && dy == -1) {
    // action = 0; //up
    return 0;
  } else if (dx == 1 && dy == 0) {
    // action = 1; //right
    return 1;
  } else if (dx == 0 && dy == 1) {
    // action = 2; //down
    return 2;
  } else if (dx == -1 && dy == 0) {
    // action = 3; //left
    return 3;
  } else if (dx == 0 && dy == 0) {
    // action = 4; //stay
    return 4;
  }
}
function showFoV(paraX, paraY, mDist) {
  if (agentX > 0 && agentX < width && agentY > 0 && agentY < height) {
    var blockList = ['wall', 'door', 'rubble']
    var op1 = [[1, 0], [-1, 0], [0, 1], [0, -1]]; // right, left, down, up
    var op2 = [[1, 0], [0, -1], [-1, 0], [0, 1], [1, 0]];
    var op = [[[0, 1], [0, 1], [1, 0], [1, 0]], [[0, 0], [0, 0], [0, 0], [0, 0]], [[0, -1], [0, -1], [-1, 0], [-1, 0]]];
    for (var i = 0; i < op1.length; i++) {
      for (var t = 0; t < mDist; t++) {
        if (agentX == 1 || agentX == 91 || agentY == 1 || agentY == 48) {
          if (t > 0) {
            break;
          }
        }
        if (blockList.includes(grid[agentX + op2[i][0] * (t + 1) + op2[i + 1][0] * t][agentY + op2[i][1] * (t + 1) + op2[i + 1][1] * t].goal) &&
          blockList.includes(grid[agentX + op2[i + 1][0] * (t + 1) + op2[i][0] * t][agentY + op2[i + 1][1] * (t + 1) + op2[i][1] * t].goal)) {
          for (var k = 1; k < mDist - t + 1; k++) {
            for (var h = 1; h < mDist - t + 1; h++) {
              let idx = listFoV.indexOf("(" + (agentX + op2[i][0] * (t + k) + op2[i + 1][0] * (t + h)) + "," + (agentY + op2[i][1] * (t + k) + op2[i + 1][1] * (t + h)) + ")")
              if (idx > -1) {
                listFoV.splice(idx, 1);
              }
            }
          }
        }
      }

      for (var j = 0; j < op.length; j++) {
        var tmpX = op1[i][0] + op[j][i][0];
        var tmpY = op1[i][1] + op[j][i][1];
        if (blockList.includes(grid[agentX + tmpX][agentY + tmpY].goal)) {
          let idx = listFoV.indexOf("(" + (agentX + tmpX * 2) + "," + (agentY + tmpY * 2) + ")")
          if (idx > -1) {
            listFoV.splice(idx, 1);
          }

          var tmpX3 = op1[i][0] * 2 + op[j][i][0];
          var tmpY3 = op1[i][1] * 2 + op[j][i][1];
          idx = listFoV.indexOf("(" + (agentX + tmpX3) + "," + (agentY + tmpY3) + ")")
          if (idx > -1) {
            listFoV.splice(idx, 1);
          }
        }
      }
    }

    if (listFoV.indexOf("(" + paraX + "," + paraY + ")") > -1) {
      grid[paraX][paraY].revealed = true;
      grid[paraX][paraY].drawFoV();
    } else {
      grid[paraX][paraY].revealed = false;
    }
  }
}

function isFoV(paraX, paraY, mDist) {
  var mLeft = agentX - mDist;
  var mRight = agentX + mDist;
  var mUp = agentY - mDist;
  var mDown = agentY + mDist;
  if (agentY == 0) {
    mUp = 0;
  }
  else if (agentY == height) {
    mDown = height;
  }
  if (agentX == 0) {
    mLeft = 0;
  }
  else if (agentX == width) {
    mRight = width;
  }
  return (paraX >= mLeft && paraX <= mRight && paraY >= mUp && paraY <= mDown);
}

function make2DArray(cols, rows) {
  var arr = new Array(cols);
  for (var i = 0; i < arr.length; i++) {
    arr[i] = new Array(rows);
  }
  return arr;
}

var timeout;
function startTimer(duration, display) {
  var start = Date.now(),
    diff,
    minutes,
    seconds;

  function timer() {
    diff = duration - (((Date.now() - start) / 1000) | 0);

    if (diff >= 0) {
      minutes = (diff / 60) | 0;
      seconds = (diff % 60) | 0;
      minutes = minutes < 10 ? "0" + minutes : minutes;
      seconds = seconds < 10 ? "0" + seconds : seconds;
      display.textContent = minutes + ":" + seconds;
      document.getElementById("time").innerHTML = minutes + ":" + seconds;
    }
  };
  timer();
  timeout = setInterval(timer, 1000);
}

function startWaitTimer() {
  var start = Date.now(),
    diff,
    minutes,
    seconds;
  var t;
  function timer() {
    diff = lobbyWaitTime / 1000 - (((Date.now() - start) / 1000) | 0);

    if (diff >= 0) {
      minutes = (diff / 60) | 0;
      seconds = (diff % 60) | 0;
      minutes = minutes < 10 ? "0" + minutes : minutes;
      seconds = seconds < 10 ? "0" + seconds : seconds;
      $('#elapsed').text('');
      $('#elapsed').text(minutes + ":" + seconds);
    }
  };
  timer();
  t = setInterval(timer, 1000);
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}