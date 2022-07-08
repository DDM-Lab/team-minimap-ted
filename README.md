# Interactive Web-based Team Minimap (v1.2)
This is a 2D browser-based implementation of a team task Search and Rescue mission (for team). It uses the FastAPI Python framework and Javascript display the interface in a web browser. 

- Navigate the grid: `Arrow Keys` or `Arrow Keys + X` to speed up the move
- Open a door: `Enter` (only Engineer)
- Clear rubble: `Enter` x 5 times (only Engineer)
- Rescue GREEN victims: `Enter` x 10 times
- Rescue YELLOW victims: `Enter` x 20 times; Engineer must clear rubble first, then the Medic saves the Yellow victim
- Rescue RED victims: `Enter` x 20 times requiring the presence of Medic and Engineer
- YELLOW victims disappear after 3 minutes
- RED victims disappear after 2 minutes

## Features:
This version is featured with collective intelligence-based metrics, called TED (Team Effective Diagnostic). The metrics are computed in real time and reported after a predefined interval. 

## Requirements:
- To run locally:
    - Python 3.7+ installed
    - A Web browser

## Local Installation
1. In a command shell, goto the main folder of the cloned git repository which contains the `requirements.txt` file.
2. (suggestion) Create a virtual Python Environment by running the following commands in your shell. (This may be different on your machine!  If it does not work, look at how to install a virtual python env based on your system.):
    - `python3 -m venv env`
    - `source env/bin/activate`
3. Install the required python libraries by running this command in your shell:
    - `pip install -r requirements.txt`

## Notice
This application is undergoing development. Any suggestions and code updates/requests are welcome.

## Testing
2 visibility modes: 
- To run FoV (Field of View) mode: `http://0.0.0.0:5702/fov/<uid>`: substitues an actual user id for `<uid>`, e.g. [http://0.0.0.0:5702/fov/ngoc].

- To run Full map (Full view of the environment) mode: `http://0.0.0.0:5702/fullmap/<uid>`, substitues an actual user id for `<uid>`. 

The experimental procedure follows: Qualtrics (for instructions) -> Team Minimap [Waiting Room](-> Redirect to Qualtrics for postsurvey questions.

## Contact Info
Ngoc Nguyen\
ngocnt@cmu.edu