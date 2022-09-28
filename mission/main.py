from socket import socket
from mission import app, templates
from fastapi import Request, status
from fastapi import Form
from starlette.responses import RedirectResponse, Response

from sqlalchemy.orm import Session
from fastapi import Depends, FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from . import models, schemas, crud
from .db import ENGINE, SessionLocal

models.Base.metadata.create_all(bind=ENGINE)

import csv
from fastapi_socketio import SocketManager
from engineio.payload import Payload
Payload.max_decode_packets = 100
sio = SocketManager(app=app)

import os
import numpy as np
import pandas as pd
import sys
from mission.ted import *
import json
from datetime import datetime


######################
# Database connection #
######################

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

############
# Globals #
############

# Read in global config
CONF_PATH = os.path.join(os.getcwd(), "mission/config.json")
with open(CONF_PATH, 'r') as f:
    CONFIG = json.load(f)

def get_group_id():
    res = 0
    with ENGINE.connect() as con:
        query_str = "SELECT DISTINCT `game`.group FROM `game` ORDER BY CAST(`game`.group as SIGNED) DESC LIMIT 1"
        rs = con.execute(query_str)
        for row in rs:
            print ('Current group id: ', row['group'])
            if row['group'] != None:
                res = int(row['group'])+1
            else:
                res = 0
    print('Group id: ', res)
    return res

connections = {}
players = {}
n_rooms = 1
n_gen_room = get_group_id()

number_human = [2,2]

player_per_room = number_human[0]+number_human[1]
human_role = []
for i in range(number_human[0]):
    human_role.append(0)
for i in range(number_human[1]):
    human_role.append(1)
roomid = [i for i in range(n_gen_room*n_rooms,(1+n_gen_room)*n_rooms) for j in range(player_per_room)]
player_roomid = {} #list room_id corresponding to userid
roomid_players = {} #list of rooms:{room1:{player1:{}, player2:{}}, room2:{player21:{'x', 'y'}, player22:{'x','y'}}}
scoreboard_players = {} #similar to roomid_players
number_roles = 2

config_players = {} #list of configuration group: {room1:configuration, room2:configuration}
USER_MAP_SESSION = {}

DATA_DIR = os.path.join(os.getcwd(),'data')
is_exist = os.path.exists(DATA_DIR)
if not is_exist:
  os.makedirs(DATA_DIR)
  print(f"The new directory {DATA_DIR} is created!")

FAILURE_SESSION = []
# Maximum number of playing episodes
MAX_EPISODE = CONFIG['max_episode']
# Maximum allowable game length (in seconds)
GAME_DURATION = CONFIG['game_duration']
room_data = {} 
LOGIN_NAMES_TEMP = []

map_data = {}

def codebook (code_num):
    if code_num==1:
        return "wall"
    elif code_num==2:
        return "door"
    elif code_num==3:
        return "green"
    elif code_num==4:
        return "blue"   #blue victims (teammate save only)
    elif code_num==5:
        return "red"    #red victims (participants save only)
    elif code_num==6:
        return "yellow"
    elif code_num==7:
        return "other"
    elif code_num==8:
        return "agent"
    elif code_num==9:
        return "rubble"
    elif code_num==11:
        # return "left_pane"
        # return "center_pane"
        return ""
    elif code_num==12:
        # return "center_pane"
        return ""
    elif code_num==13:
        # return "right_pane"
        # return "center_pane"
        return ""
    

def process_map():
    df_map = pd.read_csv('mission/static/data/map_design_2.csv')
    # df_map = pd.read_csv('mission/static/data/map_design_3.csv')
    new_map = pd.melt(df_map, id_vars='x/z', value_vars=[str(i) for i in range(0,95)], var_name='z', value_name='key')
    new_map = new_map.rename(columns={"x/z": "x"})
    new_map.index.name='id'
    new_map['key2'] = new_map.apply(lambda x: codebook(x['key']), axis=1)
    new_map.columns = ['z', 'x', 'code', 'key']
    new_map.to_csv('mission/static/data/map_new.csv')
    
# process_map()

def get_map():
    csvFilePath = 'mission/static/data/map_new.csv'
    data = {} 
    global map_data
    with open(csvFilePath, encoding='utf-8') as csvf: 
        csvReader = csv.DictReader(csvf) 
        for rows in csvReader: 
            key = rows['id'] 
            data[key] = rows
    map_data = data
    
    return data

get_map()

sys.argv=['']
del sys
map_data = get_map()
human_included = True 
role_name = {0:'medic', 1:'engineer'}
human_previous_loc = {}

@app.sio.on('connect')
async def on_connect(sid: str, *args, **kwargs):
    print('User id (connected socketid): ', sid)

@app.sio.on('disconnect')
async def on_disconnect(sid: str, *args, **kwargs):
    global connections
    print('Disconnected socket id: ', sid)

    if sid in USER_MAP_SESSION:
        user_id = USER_MAP_SESSION[sid]
        if player_roomid[user_id] in connections:
            if len(connections[player_roomid[user_id]])!= player_per_room: #if the group has not formed yet;
                drop_idx = connections[player_roomid[user_id]].index(user_id) if user_id in connections[player_roomid[user_id]] else None
                if drop_idx is not None:
                    del connections[player_roomid[user_id]][drop_idx]
            app.sio.leave_room(sid, player_roomid[user_id])
            
            print('Current connections: ', len(connections))
            print("Connection info: ", connections)
            await app.sio.emit('leave',{'pid':user_id}, room=player_roomid[user_id])
            
    else:
        print('Nothing in USER_MAP_SESSION')



@app.sio.on('join')
async def on_join(sid, *args):
    global n_rooms
    global player_per_room
    global n_gen_room
    global roomid 
    global player_roomid
    global roomid_players
    global connections
    global number_roles
    msg = args[0]
    # print ('Call join...', args)
    USER_MAP_SESSION[sid] = msg['uid']
    if msg['pid'] not in player_roomid:
        if len(roomid)==0:
            n_gen_room += 1
            roomid = [i for i in range(n_gen_room*n_rooms,(1+n_gen_room)*n_rooms) for j in range(player_per_room)]
        cur_room_id = roomid.pop(0)
        # print(cur_room_id)
        if cur_room_id == 0:
            player_roomid[msg['pid']] = cur_room_id
        else:
            if (cur_room_id-1) in connections:
                if len(connections[cur_room_id-1])!=player_per_room:
                    player_roomid[msg['pid']] = cur_room_id-1
                else:
                    player_roomid[msg['pid']] = cur_room_id
            else:
                player_roomid[msg['pid']] = cur_room_id 
            
    if player_roomid[msg['pid']] not in roomid_players:
        roomid_players[player_roomid[msg['pid']]] = {}
        connections[player_roomid[msg['pid']]] = []
        room_data[player_roomid[msg['pid']]] = []
    else: 
        room_data[player_roomid[msg['pid']]].clear()
        roomid_players[player_roomid[msg['pid']]].clear()

    config_players[player_roomid[msg['pid']]] = configuration()
    scoreboard_players[player_roomid[msg['pid']]] = {'green':0, 'yellow':0, 'red':0}

    if human_included: 
        if msg['pid'] not in connections[player_roomid[msg['pid']]] and msg['pid'] not in FAILURE_SESSION:
            if len(connections[player_roomid[msg['pid']]]) != player_per_room:
                connections[player_roomid[msg['pid']]].append(msg['pid'])
                app.sio.enter_room(sid, player_roomid[msg['pid']])
        else:
            app.sio.enter_room(sid, player_roomid[msg['pid']])

        print('Player room id: ', player_roomid[msg['pid']])
        print('Connections in room id: ', connections[player_roomid[msg['pid']]])
        print('Current group size: ', len(connections[player_roomid[msg['pid']]]))

        if len(connections[player_roomid[msg['pid']]])==player_per_room:
            await app.sio.emit('start game', {}, room=player_roomid[msg['pid']]) 
        else:
            if msg['uid'] not in FAILURE_SESSION:
                # print(msg['uid'], 'calls waiting...')
                await app.sio.emit('waiting', {'in_game':True, 'max_size':player_per_room, 'status':len(connections[player_roomid[msg['pid']]])}, room=player_roomid[msg['pid']]) 
            else:
                await app.sio.emit('waiting', {'in_game':False, 'max_size':player_per_room, 'status':len(connections[player_roomid[msg['pid']]])}, room=player_roomid[msg['pid']]) 


@app.sio.on('start')
async def sio_start(sid, *args, **kwargs):
    print('Call start on server...')
    global players
    msg = args[0]
    # print(msg)
    print('Player id: ' + str(msg['pid']))

    global n_rooms
    global player_per_room
    global n_gen_room
    global roomid 
    global player_roomid
    global roomid_players
    global connections
    global number_roles

    if human_included: 
        # TED: Call initialize state and mission start for each user
        initialize_state(config_players[player_roomid[msg['pid']]])
        mission_start(config_players[player_roomid[msg['pid']]])

        if msg['pid'] not in roomid_players[player_roomid[msg['pid']]]:
            tmp = get_role_num(msg['pid'],player_roomid[msg['pid']])
            roomid_players[player_roomid[msg['pid']]][(msg['pid'])] = {'x':msg['x'], 'y':msg['y'], \
                'role':get_role(msg['pid'],player_roomid[msg['pid']])}
        
    pid = msg['pid']
    if pid in player_roomid:
        roomid_players[player_roomid[msg['pid']]][pid]['x']=msg["x"]
        roomid_players[player_roomid[msg['pid']]][pid]['y']=msg["y"]
        roomid_players[player_roomid[msg['pid']]][pid]['uid']=msg["uid"]
        roomid_players[player_roomid[msg['pid']]][pid]['timestamp']=datetime.now().timestamp()
        roomid_players[player_roomid[msg['pid']]][pid]['mission_time']=msg["mission_time"]
        roomid_players[player_roomid[msg['pid']]][pid]['event']=msg["event"]
        roomid_players[player_roomid[msg['pid']]][pid]['score']=scoreboard_players[player_roomid[msg['pid']]]
    
        room_data[player_roomid[msg['pid']]].append(json.dumps(roomid_players[player_roomid[msg['pid']]]))
        # TED: call main function.
        main(roomid_players[player_roomid[msg['pid']]], config_players[player_roomid[msg['pid']]])
    
    await app.sio.emit('connection response', {"list_players":roomid_players, "roomid":player_roomid}, room=player_roomid[msg['pid']])
    

def get_role(player_id,idroom):
    tmp = get_role_num(player_id,idroom)
    return role_name[tmp]

def get_role_num(player_id,idroom):
    global human_role
    print("ID room: ", idroom)
    print('Connection room : ', connections[idroom])
    print('Human role', human_role)
    print('Get role num: ', human_role[connections[idroom].index(player_id)])
    return human_role[connections[idroom].index(player_id)]

def getAction(x1,y1,x2,y2):
    dx = x2 - x1
    dy = y2 - y1
    if dx==0 and dy==-1:
    #// action = 0; //up
        return 0
    elif dx==1 and dy==0:
    #// action = 1; //right
        return 1
    elif dx==0 and dy==1:
    #// action = 2; //down
        return 2
    elif dx==-1 and dy==0:
    #// action = 3; //left
        return 3
    elif dx==0 and dy==0:
    #// action = 4; //interact
        return 4
    else:
        print('error dx, dy', dx, dy, x1,y1,x2,y2)
    

@app.sio.on('periodic call')
async def heartbeat(sid, *args, **kwargs):
    # print('Call periodic call...')
    global players
    global agent_steps
    # print(len(players))
    global player_roomid
    
    global roomid_players
    global number_roles
    global room_data
    msg = args[0]


@app.sio.on('record')
async def on_record_data(sid, *args, **kwargs):
    global roomid_players

    msg = args[0]
    pid = msg['pid']
    if pid in player_roomid:
        roomid_players[player_roomid[msg['pid']]][pid]['timestamp']=datetime.now().timestamp()
        roomid_players[player_roomid[msg['pid']]][pid]['mission_time']=msg["mission_time"]
        roomid_players[player_roomid[msg['pid']]][pid]['event']=msg["event"]
        if msg["event"]=='green' or msg["event"]=='yellow' or msg["event"]=='red':
            scoreboard_players[player_roomid[msg['pid']]][msg["event"]] = scoreboard_players[player_roomid[msg['pid']]][msg["event"]] + 1
        
        roomid_players[player_roomid[msg['pid']]][pid]['score']=scoreboard_players[player_roomid[msg['pid']]]
        output = {}
        room_data[player_roomid[msg['pid']]].append(json.dumps(roomid_players[player_roomid[msg['pid']]]))
        
        main(roomid_players[player_roomid[msg['pid']]], config_players[player_roomid[msg['pid']]])

        await app.sio.emit('on change', {"list_players":roomid_players[player_roomid[msg['pid']]], "score":scoreboard_players[player_roomid[msg['pid']]], "roomid":player_roomid[msg['pid']]}, room=player_roomid[msg['pid']])

@app.sio.on('ted')
async def on_call_ted(sid, *args, **kwargs):
    global player_roomid
    msg = args[0]
    pid = msg['pid']
    # print(f'Call message data of {pid}', config_players[player_roomid[pid]].state['msg_data'])
    await app.sio.emit('ted response', {"ted_players":config_players[player_roomid[pid]].state['msg_data']}, room=player_roomid[msg['pid']])


@app.sio.on('update')
async def handle_agent_event(sid, *args, **kwargs):
    msg = args[0]
    pid = msg['pid']
    global roomid_players
    global room_data
    roomid_players[player_roomid[msg['pid']]][pid]['x']=msg["x"]
    roomid_players[player_roomid[msg['pid']]][pid]['y']=msg["y"]
    output = {}
    await app.sio.emit('heartbeat', roomid_players[player_roomid[msg['pid']]], room=player_roomid[msg['pid']])


@app.sio.on('end')
async def handle_episode(sid, *args, **kwargs):
    global agents
    msg = args[0]
    print('received episode info: ' + str(msg))
    game_over = msg['episode']
    print("END EPISODE: ", game_over)

    pid = msg['pid']
    if pid in player_roomid:
        if pid in roomid_players[player_roomid[msg['pid']]]:
            roomid_players[player_roomid[msg['pid']]][pid]['x']=msg["x"]
            roomid_players[player_roomid[msg['pid']]][pid]['y']=msg["y"]
            roomid_players[player_roomid[msg['pid']]][pid]['uid']=msg["uid"]
            roomid_players[player_roomid[msg['pid']]][pid]['timestamp']=datetime.now().timestamp()
            roomid_players[player_roomid[msg['pid']]][pid]['mission_time']=msg["mission_time"]
            roomid_players[player_roomid[msg['pid']]][pid]['event']=msg["event"]
            roomid_players[player_roomid[msg['pid']]][pid]['score']=scoreboard_players[player_roomid[msg['pid']]]
            room_data[player_roomid[msg['pid']]].append(json.dumps(roomid_players[player_roomid[msg['pid']]]))
        else:
            print('End episode...', roomid_players[player_roomid[msg['pid']]])
    
    group_idx = player_roomid[msg['pid']]
    gid = msg['gid']
    
    new_path = f'{DATA_DIR}/data_group_{gid}_episode_{game_over}.json'
    with open(new_path, 'w') as outfile:
        json.dump(room_data[group_idx], outfile)
        

@app.sio.on('leave')
async def on_leave(sid, *args, **kwargs):
    user_id = USER_MAP_SESSION[sid]
    room_id=player_roomid[user_id]
    if user_id in connections[room_id]:
        del connections[room_id][connections[room_id].index(user_id)]
    FAILURE_SESSION.append(user_id)
    await app.sio.emit('end_lobby', {'uid':user_id}, room=player_roomid[user_id])


######################
# Application routes #
######################
@app.get("/")
async def index(request:Request):
    return {"message": "Welcome"}

@app.get("/fov/{uid}")
async def load_instructions_fov(request:Request, uid: str, session:int = 1, db: Session = Depends(get_db)):
    exist = crud.check_exist(db, uid)
    print("Exist: ", exist)
    if uid not in LOGIN_NAMES_TEMP:
        LOGIN_NAMES_TEMP.append(uid)
        if exist is False:
            return templates.TemplateResponse("start.html", {"request":request, "data":uid, "session":session})
        else:
            return templates.TemplateResponse("failure.html", {"request":request, "data":uid, "session":session})
    else:
        return templates.TemplateResponse("failure.html", {"request":request, "data":uid, "session":session})

@app.get("/fullmap/{uid}")
async def load_instructions_fov(request:Request, uid:str, session:int=1, db: Session = Depends(get_db)):
    print("Getting uid: ", uid)
    exist = crud.check_exist(db, uid)
    print("Exist: ", exist)
    if uid not in LOGIN_NAMES_TEMP:
        LOGIN_NAMES_TEMP.append(uid)
        if exist is False:
            return templates.TemplateResponse("startfullmap.html", {"request":request, "data":uid, "session":session})
        else:
            return templates.TemplateResponse("failure.html", {"request":request, "data":uid, "session":session})
    else:
        return templates.TemplateResponse("failure.html", {"request":request, "data":uid, "session":session})

@app.post("/instructions")
async def load_instructions(request:Request, uid: str = Form(...), session:int = Form(...), db: Session = Depends(get_db)):
    exist = crud.check_exist(db, uid)
    if uid not in LOGIN_NAMES_TEMP:
        LOGIN_NAMES_TEMP.append(uid)
        if exist is False:
            return templates.TemplateResponse("instructions.html", {"request":request, "data":uid, "session":session})
        else:
            return templates.TemplateResponse("failure.html", {"request":request, "data":uid, "session":session})
    else:
        return templates.TemplateResponse("failure.html", {"request":request, "data":uid, "session":session})


@app.post("/minimap/")
async def post_full_map(request:Request, uid: str = Form(...)):
    print("Call minimap: ", uid)
    return templates.TemplateResponse("minimap.html", {"request":request, "data":uid})


@app.post("/fullmap/")
async def post_full_map(request:Request, uid: str = Form(...)):
    print("Call full minimap: ", uid)
    return templates.TemplateResponse("fullmap.html", {"request":request, "data":uid})


@app.get("/demo/")
async def load_map(request:Request):
    return templates.TemplateResponse("minimapdemo.html", {"request":request})


@app.get("/episode/{uid}")
async def get_episode(request:Request, uid:str, db: Session = Depends(get_db)):
    episode = crud.get_episode_by_uid(db, uid)
    print("Episode from server: ", episode)
    return episode

@app.get("/points/{uid}")
async def get_total_pints(request:Request, uid:str, db: Session = Depends(get_db)):
    points = 0
    with ENGINE.connect() as con:
        query_str = "SELECT episode, target, COUNT(DISTINCT target_pos) as num FROM `game` WHERE `game`.group = (select distinct `game`.group from `game` where userid= '" + uid + "') and (target LIKE 'green%' or target LIKE 'yellow%' or target LIKE 'red%') GROUP BY episode, target"
        rs = con.execute(query_str)
        for row in rs:
            if row['target']=='green_victim':
                points += row['num']*10
            elif row['target']=='yellow_victim':
                points += row['num']*30
            elif row['target']=='red_victim':
                points += row['num']*60
    return points


@app.get("/map")
async def get_map_data():
    x_pos = set()
    y_pos = set()
    
    for k in list(map_data.keys()):
        x_pos.add(map_data[k]['x'])
        y_pos.add(map_data[k]['z'])
    x_pos = [int(i) for i in x_pos]
    y_pos = [int(i) for i in y_pos]
    max_x = max(x_pos)
    max_y = max(y_pos)
    return {"map_data":map_data, 'max_x':max_x, 'max_y':max_y, 'max_episode':MAX_EPISODE}

@app.post("/game_play", response_model=schemas.Game)
async def create_game(game: schemas.GameCreate, db: Session = Depends(get_db)):
    return crud.create_game(db=db, game=game)

@app.post("/completion")
async def get_map_data():
    # return {"message": "Thank you!"}
    return RedirectResponse(url="https://cmu.ca1.qualtrics.com/jfe/form/SV_5jbyTyysGcsPFTo", status_code=status.HTTP_303_SEE_OTHER)
