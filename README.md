# Mars ISRU Simulator

React site for the CHO301 Mars Sabatier plant project. Enter inputs and view results, simulation, streams, reactor curves, economics and validation.

    npm install
    npm run dev      # local site
    npm test         # checks the model against DWSIM results
    npm run build    # static site in dist/

The calculations are in `src/model/plant.js`. They run in the browser and do not run DWSIM. `src/model/reference.js` holds the DWSIM results used for checking. See the Validation tab for limits.
