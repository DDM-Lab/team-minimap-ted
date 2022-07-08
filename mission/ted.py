# Commented out IPython magic to ensure Python compatibility.
import sys
import json
import math
import os
import ast
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import json
import os

def initialize_state(config):
    """
    Set the tracking values to their initial states. Should be called at the
    start of a trial.
    """
    config.state = {
        # Map from alias to player name.
        'aliases': {},

        # Set to True when a mission is running. We only accumulate data and
        # produce values when this is True.
        'is_running': False,
        # The last time we reported results to the bus.
        'last_report_time': -1,

        # Here we accumulate all of the msg_data we produce. When the mission
        # stops, we write these to a csv file.
        'msg_data': [],

        # Here are a few values that we published and keep around to support
        # aggregate computations.
        'triaging': [],
        'team_scores': [],
        # 'word_counts': [],

        # For the process_..._agg values.
        'players_deltas': [],
        'efforts': [],
        'skill_uses': [],
        'workloads': [],

        # We track some values by player.
        'players': {},

        # Position and exploration values. We track the number of squares
        # visited so far and the new ones this period. These are sets of (x, z)
        # tuples.
        'visited_positions': set(),
        'new_positions': set(),

        # These accumulate data from messages that are then reported
        # periodically. In most cases, these are values since the last report.
        'cur_scores': None,
    }

    yellow = pd.read_csv('mission/static/data/yellow.csv')
    config.extra_info['yellow_pos']=set(zip(yellow.x, yellow.z))

    red = pd.read_csv('mission/static/data/red.csv')
    config.extra_info['red_pos']=set(zip(red.x, red.z))

    green = pd.read_csv('mission/static/data/green.csv')
    config.extra_info['green_pos']=set(zip(green.x, green.z))

    rubble_df = pd.read_csv('mission/static/data/rubble_pos.csv')
    config.extra_info['rubble_pos']=set(zip(rubble_df.x, rubble_df.z))

    doors_df = pd.read_csv('mission/static/data/doors.csv')
    config.extra_info['door_pos']=set(zip(doors_df.x, doors_df.z))
    #config.extra_info['red_pos'].update(config.extra_info['yellow_pos'])


def mission_start( config):
    """
    Call this when the mission starts. Should reinitialize values as needed.
    """
    config.state['is_running'] = True
    config.step = 1
    # config.state['last_report_time'] = data['elapsed_milliseconds']


def mission_stop( config):
    """
    Call this when the mission stops. Should report final values.
    """
    config.state['is_running'] = False
    config.step = 'final'


    # And record a CSV file with all of the msg_data we published.
    df = pd.DataFrame.from_records(config.state['msg_data'])
    msg_filename = os.path.join('output/', 'msg-data.csv')
    df.to_csv(msg_filename, index=False)

def check_red_position(red,player_id):
    adj_tiles = [(-1,0),(1,0),(0,1),(0,-1)]
    red_pos=set()
    for i in adj_tiles:
        red_pos.add((i[0]+red[0],i[1]+red[1]))
    for player in config.state['players'].values():
        curr =(player['last_x'],player['last_y'])
        if curr in red_pos and player['id']!= player_id:
            return True
    return False 

def check_tiles(data,player_data,type):
    '''Note: Checking if the rubble or victims around the player'''

    x=data['x']
    y=data['y']

    adj_tiles = [(1,0),(-1,0),(0,-1),(0,1)]


    for i in adj_tiles:

        
        if (x+i[0],y+i[1]) in config.extra_info[type]:
            if type == 'red_pos' and not check_red_position((x+i[0],y+i[1]), player_data['id']):
                return False

            if (x+i[0],y+i[1]) ==(32,31):
                fas=32


            return True

    return False

def remove_tile(data,player_data,type):
    x=data['x']
    y=data['y']

    adj_tiles = [(1,0),(-1,0),(0,-1),(0,1)]


    for i in adj_tiles:
        if (x+i[0],y+i[1]) in config.extra_info[type]:
            config.extra_info[type].remove((x+i[0],y+i[1]) )
            return

def check_duration(player_data,data):
    '''Note: Checking if the itme is over the threshod of 5 seconds. E.g., they can start triage but not saving it.'''
    skills= ['dig_rubble','triage_green','triage_red','triage_yellow']
    for skill in skills:

        start_time_key = f'{skill}_start_time'
        #duration_key = f'{skill}_duration_s'
        if player_data[start_time_key] == None:
            continue
        dur=data['timestamp']-player_data[start_time_key]
        if dur > 5:
            player_data[start_time_key] = None
    return

def process_event(data,player,config):

  player_data = ensure_player_data(player, config)
  player_data['curr_timestamp']=data['timestamp']

  player_data['event']=data['event']
  player_data['cur_role']=data['role']

  elapsed_s = data['timestamp']


  if elapsed_s>=1655837538.16063 and player_data['id']=='A5P12YJP805RG':
      sfa=2
  check_duration(player_data,data)


  if data['event'] == 'door' :
    #door is just one second of skill (currently same skill as removing rubble)
    #record_skill_duration(data,'dig_rubble',player_data)
    player_data['skill_end'] = elapsed_s
    if not check_tiles(data,player_data,'door_pos'):
        return
    remove_tile(data,player_data,'door_pos')
    player_data['effort']+=1
    player_data['dig_rubble_duration_s']+=0.2

  elif data['event'] == 'rubble' :
    if (elapsed_s-player_data['skill_end'])<1:
        return
    record_skill_duration(data,'dig_rubble',player_data)
    remove_tile(data,player_data,'rubble_pos')

    player_data['skill_end'] = elapsed_s
    player_data['effort']+=5

  elif data['event'] == 'triage green in-progress' :
    if (elapsed_s-player_data['skill_end'])<1:
        return
    if not check_tiles(data,player_data,'green_pos'):
        return
    record_skill_start(data, "triage_green", player_data)


  elif data['event'] == 'triage yellow in-progress' :
    if (elapsed_s-player_data['skill_end'])<1:
        return

    if not check_tiles(data,player_data,'yellow_pos'):
        return
    record_skill_start(data, "triage_yellow", player_data)

  elif data['event'] == 'triage red in-progress' :
    if (elapsed_s-player_data['skill_end'])<1:
        return
    if not check_tiles(data,player_data,'red_pos') :
        return
    record_skill_start(data, "triage_red", player_data)

  elif data['event'] == 'clear rubble in-progress' :
    if player_data['dig_rubble_start_time']:
        return
    if (elapsed_s-player_data['skill_end'])<1:
        return
    if not check_tiles(data,player_data,'rubble_pos') :
        return
    record_skill_start(data, "dig_rubble", player_data)

  elif data['event'] == 'green' :
    if (elapsed_s-player_data['skill_end'])<1:
        return
    player_data['triage_green_success_count']+=1
    record_skill_duration(data, "triage_green", player_data)
    remove_tile(data,player_data,'green_pos')

    player_data['skill_end'] = elapsed_s
    player_data['effort']+=10

  elif data['event'] == 'yellow' :
    if (elapsed_s-player_data['skill_end'])<1:
        return
    player_data['effort']+=20

    player_data['triage_yellow_success_count']+=1
    record_skill_duration(data, "triage_yellow", player_data)
    player_data['skill_end'] = elapsed_s
    remove_tile(data,player_data,'yellow_pos')

  elif data['event'] == 'red' :
    if (elapsed_s-player_data['skill_end'])<1:
        return
    player_data['effort']+=20

    player_data['triage_red_success_count']+=1
    record_skill_duration(data, "triage_red", player_data)
    player_data['skill_end'] = elapsed_s
    remove_tile(data,player_data,'red_pos')

  elif data['event'] == "start speedup":
    record_skill_start(data, "speedup", player_data)
  elif data['event'] == "end speedup":
    record_skill_duration(data, 'speedup',player_data)



def record_skill_start(data, skill, player_data):
    """
    Record the start of a skill use.
    """
    start_time_key = f'{skill}_start_time'
    elapsed_s = data['timestamp']
    max_wait = 5
    skills = ['rubble', 'triage']


    # If we are not already doing the thing, mark the time was started doing the
    # thing.
    if player_data[start_time_key] is None:
        player_data[start_time_key] = elapsed_s
    '''elif elapsed_s - player_data[start_time_key] > max_wait and skill in skills:
        player_data[start_time_key] = elapsed_s'''




def record_skill_success(_data, skill, player_data):
    """
    Record the successful completion of a skill use. This is only success, not
    failure.
    """
    success_key = f'{skill}_success_count'
    player_data[success_key] += 1


def record_skill_duration(data, skill, player_data):
    """
    Record the time spent on the skill (irrespective of success or failure).
    """
    start_time_key = f'{skill}_start_time'
    duration_key = f'{skill}_duration_s'

    # Compute the triage duration and add it to the state. If we do not have a
    # start time, we cannot compute a duration, so just return.
    if player_data[start_time_key] is None:
        return

    # Store the duration.
    elapsed_s = player_data['curr_timestamp']
    duration_s = elapsed_s - player_data[start_time_key]
    #print(duration_s,skill)
    player_data[duration_key] += duration_s

    # Reset the start time.
    player_data[start_time_key] = None

def record_location(data,player, config):
    """
    Here we accumulate the exploration information.
    Note: Check if it's a new exploration; check FoV that if they explored or not. 
    """
    # We are not accumulating player-specific information here. But let's at
    # least make sure we have a data entry for them.
    player_data = ensure_player_data(player, config)

    # If the delta in time will be zero, just don't even try.
    elapsed_s = data['timestamp']

    # First we get the position (as integers).
    player_pos = (int(data['x']), int(data['y']))

    # We will set this to true if this as exploration. We use it to update
    # exploration timing.
    was_exploration = False

    # Now we get the FOV as a 7x7 square with player in the middle. CMU notes
    # that they lose cells in about 10-12% of cases with 5x5. After I worked out
    # the math, I asked CMU for their ideal size on this, and Pranav asked for
    # 5x5.
    #
    # for i in range(-3, 4):
    #     for j in range(-3, 4):
    update_player_movement(data, player_data, config)

    for i in range(-2, 3):
        for j in range(-2, 3):
            x=player_pos[0] + i
            y=player_pos[1] + j
            pos = (x, y)


            # If this was not new, we're done here.
            if pos in config.state['visited_positions']:
                continue

            # If this was in the entrance hallway, just skip along.
            # if pos[1] > 62:
            #     continue

            # If we get here, the position is new, so record it now.
            config.state['visited_positions'].add(pos)
            config.state['new_positions'].add(pos)

            was_exploration = True
            record_skill_success(data, 'explore', player_data)

    if was_exploration:
        record_skill_start(data, 'explore', player_data)
    


def update_player_movement(data, player_data, _config):
    """
    Update our tracking for the player's movement. Label it exploration or
    standing as appropriate.
    """


    # We were checking for movement to see if the player has stopped breaking
    # rubble. However, some players move while breaking rubble. So now we just
    # check to see if enough time has elapsed and if so we stop the rubble
    # breaking.
    '''
    if player_data['dig_rubble_start_time'] is not None:
        rubble_duration = elapsed_ms - player_data['dig_rubble_start_time']
        if rubble_duration > 1000:
            # print('Canceling rubble digging due to elapsed time.')
            record_skill_duration(data, 'dig_rubble', player_data)

    # If the player is exploring and has moved to a new block, stop the timer.
    # If they are exploring a new block, we'll set the timer again in the
    # calling function.
    and \
        (data['x'] != player_data['last_x'] or
         data['y'] != player_data['last_y']):
    '''

    elapsed_s = data['timestamp']

    if player_data['explore_start_time'] is not None and \
        (data['x'] != player_data['last_x'] or
         data['y'] != player_data['last_y']):
        record_skill_duration(data, 'explore', player_data)

    # Compute the movement distance and speed.
    move_speed = None
    if player_data['last_x'] is not None:
        dx = abs(data['x'] - player_data['last_x'])
        dz = abs(data['y'] - player_data['last_y'])
        dt = abs(elapsed_s - player_data['last_pos_elapsed_s'])

        move_dist = dx+ dz 
        #move_speed =  move_dist / dt
 
        # print(f'moved {move_dist:.2f} at {move_speed:.2f} m/s')

        player_data['effort']+=move_dist
        if player_data['speedup_start_time']:
            player_data['effort']+=move_dist
        player_data['move_duration_s']+=move_dist*0.2

    # Update the position values for next step.
    player_data['last_x'] = data['x']
    player_data['last_y'] = data['y']
    player_data['last_pos_elapsed_s'] = data['timestamp']

def publish_ac_result(data, config):
    """
    Prepares the score information and publishes a message on the bus.
    """
    msg_data = prepare_ac_msg_data(data , config)
    config.state['msg_data'].append(msg_data)

    # Round the scores to a reasonable amount of precision.
    #round_scores(msg_data)

    # Actually produce the message.
    '''
    config.helper.send_msg("agent/ac/" + \
                           config.helper.agent_name + "/ted",
                           "agent",
                           "AC:TED",
                           "0.1",
                           timestamp=config.helper.generate_timestamp(),
                           data=msg_data)'''

    # Plot the positions (if needed). Do this before resetting state for next
    # iteration so that we can see new positions.
    #plot_coverage(config)

    #config.logger.info(f' - data = {msg_data}')
    # print('Call from publish_ac_result:', msg_data)
    

def prepare_ac_msg_data(data, config):
    """
    Prepares and returns the AC message data to be published for this period.
    """
    elapsed_s, delta_s = get_elapsed_time(data, config)
    msg_data = {
        # Timing information.
        'elapsed_s': elapsed_s,
        'delta_s': delta_s,
        'inaction_stand_s' : 0,
        'action_triage_s': 0,
        'process_workload_burnt':0
    }


    ########include in compute skills after determining how it will be reported


    compute_skills(data,msg_data, config)

    # Reset the time for next pass.
    config.state['last_report_time'] = elapsed_s

    # Compute all the supporting values.
    compute_coverage(msg_data, config)


    #compute_scores(msg_data, config)

    compute_process_values(msg_data, config)
    #config.logger.debug(f"Message data: {msg_data}")
    return msg_data

def check_elapsed_time(data, config):
    """
    Check to see if we have reached the end of a period. If so, compute and
    report the next set of values. This should be called periodically, probably
    with every message we receive.
    """
    # If we are running, we should do things. Otherwise, we should sit tight.
    if not config.state['is_running']:
        return

    elapsed_s, delta_s = get_elapsed_time(data, config)
    if delta_s < config.extra_info['period_s']:
        return False
    return True
    # Actually prepare and report the appropriate values.
    #config.logger.info(f'Time to report scores -- step {config.step}: {elapsed_s} (+ {delta_s})')
    #publish_ac_result(data, config)
    #config.step += 1

def get_elapsed_time(data, config):
    """
    Finds the elapsed time and computes the delta since the last update. Returns
    both.
    """
    # If we do not have time information, do not do anything.
    if 'timestamp' not in data:
        return -1, -1

    # Get the time.
    elapsed_s = data['timestamp']

    # If we did not have a last report time, set it now so that we'll start
    # going forward.
    if config.state['last_report_time'] < 0:
        config.state['last_report_time'] = elapsed_s
        return elapsed_s, 0

    delta_s = elapsed_s - config.state['last_report_time']
    return elapsed_s, delta_s

def reset_player_field(field, config):
    """
    Resets the given field to 0 for each known player state.
    """
    for player in config.state['players'].values():
        player[field] = 0

def compute_coverage(msg_data, config):
    """
    Computes the coverage values and adds them to the msg_data.
    """
    # Update location values.
    msg_data['process_coverage'] = len(config.state['new_positions'])
    msg_data['process_coverage_agg'] = \
        len(config.state['visited_positions']) / config.extra_info['total_coverage_area']

    # Reset bookkeeping.
    config.state['new_positions'] = set()


def compute_skills(data,msg_data, config):
    global check_dict
    """
    Computes the skill action/inaction values and adds them to the msg_data.
    """
    elapsed_s = msg_data['elapsed_s']

    # Initialize the values to 0, we will add to them below.
    msg_data['effort'] = 0
    msg_data['move'] = 0
    msg_data['skill'] = 0

    msg_data['action_green_triage_s'] = 0
    msg_data['action_yellow_triage_s'] = 0
    msg_data['action_red_triage_s'] = 0
    msg_data['action_dig_rubble_s'] = 0
    msg_data['dig_rubble_count'] = 0
    msg_data['triage_count_green']=0
    msg_data['triage_count_yellow']=0
    msg_data['triage_count_red']=0


    msg_data['action_speedup_s'] = 0

    # Update skill-related values.
    ############ Need to reset start time to this timestamp

    for player_data in config.state['players'].values():
        indv_msg = {}
        flag = 0
        flag_triage_green = 0
        flag_triage_red = 0
        flag_triage_yellow = 0


        flag_rubble = 0

        if player_data['speedup_start_time']:
            flag=1

        if player_data['triage_green_start_time']:
            flag_triage_green=1

        if player_data['triage_red_start_time']:
            flag_triage_red=1

        if player_data['triage_yellow_start_time']:
            flag_triage_yellow=1

        if player_data['dig_rubble_start_time']:
            flag_rubble=1


        indv_msg['effort']=player_data['effort']
        msg_data['effort']+=player_data['effort']

        record_skill_duration(data,'dig_rubble',player_data)
        record_skill_duration(data,'triage_green',player_data)
        record_skill_duration(data,'triage_red',player_data)
        record_skill_duration(data,'triage_yellow',player_data)


        record_skill_duration(data,'speedup',player_data)
        if flag == 1:
            record_skill_start(data,'speedup',player_data)
        if flag_triage_green == 1:
            record_skill_start(data,'triage_green',player_data)
        if flag_triage_yellow == 1:
            record_skill_start(data,'triage_yellow',player_data)
        if flag_triage_red == 1:
            record_skill_start(data,'triage_red',player_data)


        if flag_rubble == 1:
            record_skill_start(data,'dig_rubble',player_data)

        indv_msg['triage_count_green'] =player_data['triage_green_success_count']
        indv_msg['triage_count_yellow'] =player_data['triage_yellow_success_count']
        indv_msg['triage_count_red'] =player_data['triage_red_success_count']

        msg_data['triage_count_green']+=player_data['triage_green_success_count']
        msg_data['triage_count_yellow']+=player_data['triage_yellow_success_count']
        msg_data['triage_count_red']+=player_data['triage_red_success_count']

        indv_msg['action_green_triage_s']=player_data['triage_green_duration_s']
        msg_data['action_green_triage_s']+=player_data['triage_green_duration_s']

        indv_msg['action_yellow_triage_s']=player_data['triage_yellow_duration_s']
        msg_data['action_yellow_triage_s']+=player_data['triage_yellow_duration_s']

        indv_msg['action_red_triage_s']=player_data['triage_red_duration_s']
        msg_data['action_red_triage_s']+=player_data['triage_red_duration_s']

        indv_msg['move']=player_data['move_duration_s']
        msg_data['move']+=player_data['move_duration_s']

        indv_msg['action_speedup_s']=player_data['speedup_duration_s']
        msg_data['action_speedup_s']+=player_data['speedup_duration_s']

        indv_msg['action_dig_rubble_s']=player_data['dig_rubble_duration_s']
        msg_data['action_dig_rubble_s']+=player_data['dig_rubble_duration_s']

        indv_msg['previous_timestamp'] = player_data['last_pos_elapsed_s']

        indv_msg['exploration'] = player_data['explore_success_count']

        if player_data['cur_role']=='medic':
            indv_msg['skill_s']=player_data['triage_yellow_duration_s']+player_data['triage_red_duration_s']
            indv_msg['skill_s']=indv_msg['skill_s']/(player_data['triage_green_duration_s']+player_data['move_duration_s']+indv_msg['skill_s']+0.00001)
        else:
            indv_msg['skill_s']=player_data['dig_rubble_duration_s']
            indv_msg['skill_s']=indv_msg['skill_s']/(player_data['triage_green_duration_s']+player_data['move_duration_s']+indv_msg['skill_s']+0.0001)
        
        msg_data['skill']+=indv_msg['skill_s']


        indv_msg['workload']=(player_data['triage_green_success_count']/2+\
        player_data['triage_red_success_count']/2+player_data['triage_yellow_success_count']/2+\
             player_data['explore_success_count']/100)*0.5



        indv_msg['skill_s']=player_data['triage_green_duration_s']+player_data['dig_rubble_duration_s']+player_data['speedup_duration_s']



        player_data['msg'].append(indv_msg)

        check_dict[player_data['id']+'_triage'] = str(player_data['triage_green_success_count'] +\
            player_data['triage_red_success_count']+player_data['triage_yellow_success_count'])

        check_dict[player_data['id']+'_exploration'] = str(player_data['explore_success_count']) 

        check_dict[player_data['id']+'_speedup'] = str(player_data['speedup_duration_s']) 
        check_dict[player_data['id']+'_rubble'] = str(player_data['dig_rubble_duration_s']) 
        check_dict[player_data['id']+'_triage_red'] = str(player_data['triage_red_duration_s']) 
        check_dict[player_data['id']+'_triage_green'] = str(player_data['triage_green_duration_s']) 
        check_dict[player_data['id']+'_triage_yellow'] = str(player_data['triage_yellow_duration_s']) 
        check_dict[player_data['id']+'_move'] = str(player_data['move_duration_s']) 


        check_dict[player_data['id']+'_effort'] = str(player_data['effort']) 
        check_dict[player_data['id']+'_timestamp'] = str(player_data['curr_timestamp']) 
        check_dict[player_data['id']+'_x'] = str(player_data['last_x']) 
        check_dict[player_data['id']+'_y'] = str(player_data['last_y']) 
        check_dict[player_data['id']+'_event'] = str(player_data['event'])

    # Reset bookkeeping.
    reset_player_field('effort', config)
    for skill in ('triage', 'speedup','dig_rubble', 'move_victim', 'explore','triage_red' ,'triage_yellow', 'triage_green','move' ):
        reset_player_field(f'{skill}_duration_s', config)
        reset_player_field(f'{skill}_success_count', config)



def compute_scores(msg_data, config):
    """
    Computes the score-related values and adds them to the msg_data.
    """
    # Update the score-related values.
    if config.state['cur_scores']:
        cur_team_score = config.state['cur_scores']['team_score']
        prev_team_score = sum(config.state['team_scores'])

        msg_data['team_score'] = cur_team_score - prev_team_score
        msg_data['team_score_agg'] = cur_team_score
    else:
        msg_data['team_score'] = 0
        msg_data['team_score_agg'] = 0

    # Update for next round.
    config.state['team_scores'].append(msg_data['team_score'])

def compute_process_values(msg_data, config):
    """
    Roll up the intermediate values to produce higher-level team-process values.
    """
    delta_s = msg_data['delta_s']

    # Accumulate the total time available as the length of this period times the
    # number of players present.
    num_players = len(config.state['players'])
    players_delta_s = num_players * delta_s 
    config.state['players_deltas'].append(players_delta_s)

    
    msg_data['process_skill_use_s'] = msg_data['skill']/4
    config.state['skill_uses'].append(msg_data['skill']/4)

    # Effort is the flip of inaction.
    msg_data['process_effort_s'] =  msg_data['effort']/400
    config.state['efforts'].append(msg_data['process_effort_s'])

    '''
    msg_data['process_skill_use_rel'] = 0
    if msg_data['process_effort_s']:
        msg_data['process_skill_use_rel'] = \
            msg_data['process_skill_use_s'] / msg_data['process_effort_s']'''

    # Workload burnt is average of exploration and triage.
    msg_data['triage_workload'] = (msg_data['triage_count_red'] / 8)+\
        (msg_data['triage_count_yellow'] /8) +\
        (msg_data['triage_count_green'] / 8)
    msg_data['process_workload_burnt'] = \
        msg_data['process_coverage'] /400+ \
        msg_data['triage_workload']
    msg_data['process_workload_burnt'] *= 0.5
    config.state['workloads'].append(msg_data['process_workload_burnt'])

    # Now compute the aggregate values. These reflect the full history and are
    # normalized so that they should be between 0 and 1.
    #
    # The skill use and effort seconds are summed across all players. So we
    # divide by the number of player seconds as part of computing the agg value.
    #
    '''
    total_players_s = num_players * config.extra_info['total_mission_s']
    if total_players_s:
        msg_data['process_skill_use_agg'] = \
            sum(config.state['skill_uses']) / total_players_s
        msg_data['process_effort_agg'] = \
            sum(config.state['efforts']) / total_players_s
        msg_data['process_workload_burnt_agg'] = sum(config.state['workloads'])
    else:
        msg_data['process_skill_use_agg'] = 0.0
        msg_data['process_effort_agg'] = 0.0
        msg_data['process_workload_burnt_agg'] = 0.0'''

def round_scores(msg_data):
    """
    Round the values to a uniform (and not excessive) number of decimal places.
    """
    NUM_SIG_FIGS=2
    for key, val in msg_data.items():
        if isinstance(val, float) and abs(val) < sys.float_info.epsilon:
            # Cannot round 0.0
            continue
        if isinstance(val, float):
            val = round(val, NUM_SIG_FIGS - 1 - int(np.floor(np.log10(abs(val)))))
            msg_data[key] = val

def plot_coverage(config):
    """
    If the plot_coverage flag is set, makes a plot of the visited positions.
    """
    if not config.plot_coverage:
        return

    visited_positions = config.state['visited_positions']
    new_positions = config.state['new_positions']

    config.logger.info('Plotting visited positions')
    minx = min([x[0] for x in visited_positions])
    maxx = max([x[0] for x in visited_positions])
    miny = min([x[1] for x in visited_positions])
    maxy = max([x[1] for x in visited_positions])

    width = maxx - minx + 1
    height = maxy - miny + 1

    # grid = np.ndarray(shape=(height, width, 3), dtype=float)
    grid = np.zeros(shape=(height, width, 3), dtype=float)
    for pos in visited_positions:
        x = pos[0] - minx
        y = pos[1] - miny

        if pos in new_positions:
            grid[y][x][0] = 1.0
            grid[y][x][1] = 1.0
            grid[y][x][2] = 1.0
        else:
            grid[y][x][0] = 0.5
            grid[y][x][1] = 0.5
            grid[y][x][2] = 0.5

    plt.figure(figsize=(12, 12))
    plt.imshow(grid, interpolation='none')
    plot_filename = \
        os.path.join(config.results_dir, f'visited-positions-{config.step}.png')
    plt.savefig(plot_filename)
    config.logger.info(f' - wrote positions to {plot_filename}')

def ensure_player_data(player, config):
    """
    Makes sure the player is recorded in the config. Return the player data
    structure.
    """
    if player not in config.state['players']:
        config.state['players'][player] = {
            # Used for computing position delta (and speed).
            'last_x': None,
            'last_y': None,
            'last_pos_elapsed_s': None,
            'id':player,

            'curr_timestamp':0,

            'skill_end':0,

            'event':'',

            # Time standing without exercising a skill.
            'inaction_stand_s': 0,

            'effort':0,

            # Time the player started triaging. Only set *while* the player is
            # actively triaging.
            'triage_green_start_time': None,
            'triage_green_duration_s': 0,

            'triage_yellow_start_time': None,
            'triage_yellow_duration_s': 0,

            'triage_red_start_time': None,
            'triage_red_duration_s': 0,            

            # Number of successful triages since we last reported results.
            'triage_green_success_count': 0,
            'triage_yellow_success_count': 0,
            'triage_red_success_count': 0,

            # Times for digging rubble skill.
            'dig_rubble_start_time': None,
            'dig_rubble_duration_s': 0,
            'dig_rubble_success_count': 0,

            # Times for digging rubble skill.
            'explore_start_time': None,
            'explore_duration_s': 0,
            'explore_success_count': 0,


            #Time moving
            'move_duration_s': 0,

            # Times for speedup.
            'speedup_start_time': None,
            'speedup_duration_s': 0,
            'speedup_success_count': 0,


            # Information pertaining to role.
            'cur_role': None,

            #individual file
            'msg':[]


        }
    return config.state['players'][player]

def main(message,config):

    global check_dict
    check_dict = {}

    publish = False
    for player in message.keys():


        record_location(message[player],player,config)
        process_event(message[player],player,config)
        check= check_elapsed_time(message[player],config)
        if check:
            publish =True
            reporting_player = player
        else:
            check_dict[player+'_speedup'] = str(config.state['players'][player]['speedup_duration_s']) 
            check_dict[player+'_rubble'] = str(config.state['players'][player]['dig_rubble_duration_s']) 
            check_dict[player+'_triage_red'] = str(config.state['players'][player]['triage_red_duration_s']) 
            check_dict[player+'_triage_yellow'] = str(config.state['players'][player]['triage_yellow_duration_s']) 
            check_dict[player+'_triage_green'] = str(config.state['players'][player]['triage_green_duration_s']) 
            check_dict[player+'_effort'] = str(config.state['players'][player]['effort']) 
            check_dict[player+'_timestamp'] = str(message[player]['timestamp']) 
            check_dict[player+'_x'] = str(message[player]['x']) 
            check_dict[player+'_y'] = str(message[player]['y']) 
            check_dict[player+'_event'] = str(message[player]['event']) 

    #if message[reporting_player]['timestamp']==1651762094:
    #    sf=1651762095
    check_dict['publish']=publish

    if publish:
        publish_ac_result(message[reporting_player], config)

    # check_file.append(check_dict)

    # return check_file
    




class configuration:
  state={}
  extra_info={'period_s':5,
              'total_coverage_area':3369,
              'total_triage_green':20,
              'total_triage_red':20,
              'total_triage_yellow':20,
              'green_pos' : set(),
              'yellow_pos' : set(),
              'red_pos' : set(),
              'rubble_pos' : set(),
              'doors_pos':set(),

            #   'map':pd.read_csv('map.csv')}
              'map':pd.read_csv('mission/static/data/map.csv')}
config = configuration()


# directory = '/Users/josecordova/Documents/cmu/TED'




# for name in os.listdir(directory):

#     if not name.endswith(".json") : 
#         continue

#     #name='data_group_0_episode_1.json'
#     f = open(name)

#     data=json.load(f)

#     initialize_state(config)
#     mission_start(config)

#     check_file= []
#     for line in data:
#         check_file=main(ast.literal_eval(line),config,check_file)

#     # Closing file
#     f.close()

#     df_check = pd.DataFrame.from_records(check_file)

#     df = pd.DataFrame.from_records(config.state['msg_data'])
#     df_check.to_csv('check/'+name+'.csv', index=False)


#     curr_path= 'output/'+name[:-5]
#     try:
#         os.mkdir(curr_path)
#     except:
#         pass
#     msg_filename = 'output/'+name[:-5]+'_global.csv'
#     df_ted=df[['process_effort_s','process_workload_burnt','process_skill_use_s','triage_workload','elapsed_s','triage_count_red','triage_count_yellow','triage_count_green']]
#     df_ted.to_csv(msg_filename, index=False)



#     for player in config.state['players']:
#         df = pd.DataFrame.from_records(config.state['players'][player]['msg'])
#         filename = curr_path+'/'+config.state['players'][player]['cur_role'][0:3]+player+'_'+'.csv'
#         df.to_csv(filename,index=False)
