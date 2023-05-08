var milesToKms = 1.60934

const kGeonamesService = 'https://secure.geonames.org/search'
const kGeolocService = 'https://secure.geonames.org/findNearbyPlaceNameJSON'
const kMinQueryInterval = 800;
const kDefaultMaxRows = 5;
const kMinNameLength = 3;

const kPlaceholderText = 'city, state';

const kClassGeoNameInput = 'geo-name-select';
const kClassSelectList = 'geoname-selection-list';
const kClassSelectOption = 'geoname-selector-option';
const kClassHidden = 'geoname-hidden';
const kClassCandidate = 'geoname-candidate';

const myMAP = "my_location_map"
const default_radius_value = 10;

const timezone = "America/Phoenix"

let flag = 0
var requestOptions = {
    method: 'GET',
};

function startCodapConnection() {
    var config = {
        title: "Purple Air Plugin",
        version: "001",
        dimensions: {
            width: 380,
            height: 800
        },
        preventBringToFront: false,
    };

    console.info("Starting codap connection");

    codapInterface.init(config).then(
        function () { //  at this point, purple_air.state is populated!
            purple_air.state = codapInterface.getInteractiveState(); // |S| initialize state variable!
            purple_air.initialize();
            return Promise.resolve();
        }
    ).catch(function (msg) {
        console.log('warn: ' + msg);
    });
};

// noinspection JSIgnoredPromiseFromCall
class GeonameSearch {
    myGeonamesUser;
    //selectionHandler;
  
    // @type {DOMElement}
    inputEl = null; // the selection text element
    // @type {DOMElement}
    selectionListEl = null; // the initially hidden selection list element
  
    placeList = [];
    selectedPlace;
  
    queryInProgress = false;
    timer = null;
  
  
    /**
     * Formats and ends a query to geonames.org.
     * API is documented here: https://www.geonames.org/export/geonames-search.html
     * @param searchString {string} free form city, state
     * @param [maxRows] {number} number of results
     * @return {Promise<Uint8Array|BigInt64Array|{latitude: *, name: string, longitude: *}[]|Float64Array|Int8Array|Float32Array|Int32Array|Uint32Array|Uint8ClampedArray|BigUint64Array|Int16Array|Uint16Array>}
     */
    async geoNameSearch(searchString, maxRows) {
      const userClause = `username=${this.myGeonamesUser}`;
      const countryClause = 'country=US';
      const maxRowsClause = `maxRows=${maxRows || kDefaultMaxRows}`;
      // const featureClassClause = 'featureClass=P'; // populated places
      // const orderByClause = 'orderby=relevance'
      const languageClause = 'lang=en';
      const typeClause = 'type=json';
      const nameRequiredClause = 'isNameRequired=true';
  
      // let nameClause = `q=${searchString}`;
      let nameClause = `name_startsWith=${searchString}`;
      let url = `${kGeonamesService}?${[userClause, countryClause, maxRowsClause, /*orderByClause, *//*featureClassClause, */languageClause, typeClause, nameRequiredClause, nameClause].join(
          '&')}`;
      let response = await fetch(url);
      if (response.ok) {
        let data = await response.json();
        if (data.totalResultsCount > 0) {
          console.log(JSON.stringify(data));
          return data.geonames.map(function (place) {
            return {
              name: `${place.name}, ${place.adminCode1}`,
              latitude: place.lat,
              longitude: place.lng
            };
          });
        }
      }
    }
  
    /**
     * Finds a geo name from lat/long
     * @param lat {number}
     * @param long {number}
     */
    async geoLocSearch(lat, long) {
      const userClause = `username=${this.myGeonamesUser}`;
      const locClause = `lat=${lat}&lon=${long}`;
      const url = `${kGeolocService}?${[locClause,userClause].join('&')}`;
      return fetch(url).then((rslt) => {
        if (rslt.ok) {
          return rslt.json();
        } else {
          return Promise.reject(rslt.statusText);
        }
      });
    }
    /**
     * Populates the selector list with place names.
     *
     * Creates elements if they don't exist. Hides them if they are unneeded
     * for current list.
     * @param containerEl {Element} The element that will contain the option list.
     * @param placeList {[Object]} A list of objects. The name property of each
     * object should be displayed.
     */
    populateGeoNameSelector(containerEl, placeList) {
      if (!this.placeList || !this.placeList.length) {
        return;
      }
      let optionEls = containerEl.querySelectorAll('.' + kClassSelectOption);
      containerEl.classList.remove(kClassHidden);
      let optionEl;
      optionEls.forEach(function (el) {
        el.classList.add(kClassHidden);
      });
      placeList.forEach(function (place, ix) {
        if (optionEls && optionEls[ix]) {
          optionEl = optionEls[ix];
          optionEl.classList.remove(kClassHidden);
          optionEl.classList.remove(kClassCandidate);
        } else {
          optionEl = document.createElement('div');
          optionEl.classList.add(kClassSelectOption);
          containerEl.append(optionEl);
        }
        optionEl.innerText = place.name;
        optionEl.setAttribute('dataix', String(ix));
        if (ix === 0) {
          optionEl.classList.add(kClassCandidate);
        }
      });
    }
  
    /**
     * Fetch selection list of candidate places.
     * @return {Promise<void>}
     */
    async autoComplete() {
      let thisQuery = this.inputEl.value;
      try {
        this.queryInProgress = true;
        let placeList = await this.geoNameSearch(thisQuery);
        this.placeList = placeList || [];
        this.populateGeoNameSelector(this.selectionListEl, this.placeList);
      } finally {
        this.queryInProgress = false;
      }
    }
  
    /**
     * Constructs the class.
     * @param attachmentEl {Element}
     * @param geonamesUser {String}
     * @param selectionEventHandler {function} Callback
     */
    constructor(attachmentEl, geonamesUser/*, selectionEventHandler*/) {
      let _this = this;
  
      function handleTimeout(/*ev*/) {
        _this.timer = null;
        // noinspection JSIgnoredPromiseFromCall
        _this.autoComplete();
      }
  
      /**
       * Handle a change to the text input.
       *
       * @param ev
       */
      function handleKeyDown(ev) {
        let selectorHidden = _this.selectionListEl.classList.contains(kClassHidden);
        let option = _this.selectionListEl.querySelector('.' + kClassCandidate);
        if (ev.key === 'Enter') {
          if (selectorHidden) {
            _this.autoComplete();
            ev.stopPropagation();
          } else {
            if (option) {
              _this.inputEl.value = option.innerText;
              _this.selectedPlace = _this.placeList[Number(option.attributes.dataix.value)];
              //_this.selectionHandler(_this.selectedPlace);
              _this.selectionListEl.classList.add(kClassHidden);
            }
          }
        } else if (ev.key === 'ArrowDown') {
          if (!selectorHidden) {
            let currentCandidateEl = _this.selectionListEl.querySelector('.' + kClassCandidate );
            let currentIx = currentCandidateEl && currentCandidateEl.getAttribute('dataix');
            let nextIx = (currentIx != null) && Math.min(Number(currentIx) + 1, kDefaultMaxRows);
            if (nextIx && Number(currentIx) !== nextIx) {
              let optionEls = _this.selectionListEl.querySelectorAll(`.${kClassSelectOption}`);
              let nextEl = optionEls[nextIx];
              if ((nextEl != null)
                  && (nextEl !== currentCandidateEl)
                  && !nextEl.classList.contains(kClassHidden)) {
                currentCandidateEl.classList.remove(kClassCandidate);
                nextEl.classList.add(kClassCandidate);
                ev.stopPropagation();
                ev.preventDefault();
              }
            }
          }
        } else if (ev.key === 'ArrowUp') {
          if (!selectorHidden) {
            let currentCandidateEl = _this.selectionListEl.querySelector('.' + kClassCandidate );
            let currentIx = currentCandidateEl && currentCandidateEl.getAttribute('dataix');
            let nextIx = (currentIx != null) && Math.max(Number(currentIx) - 1, 0);
            if ((nextIx != null) && Number(currentIx) !== nextIx) {
              let optionEls = _this.selectionListEl.querySelectorAll(`.${kClassSelectOption}`);
              let nextEl = optionEls[nextIx];
              if ((nextEl != null)
                  && (nextEl !== currentCandidateEl)
                  && !nextEl.classList.contains(kClassHidden)) {
                currentCandidateEl.classList.remove(kClassCandidate);
                nextEl.classList.add(kClassCandidate);
                ev.stopPropagation();
                ev.preventDefault();
              }
            }
          }
        } else {
          let value = this.value;
          _this.selectedPlace = null;
          if (value.length >= kMinNameLength) {
            if (_this.timer) {
              clearTimeout(_this.timer);
            }
            _this.timer = setTimeout(handleTimeout, kMinQueryInterval);
          }
        }
      }
  
      function handlePlaceNameSelection(ev) {
        let target = ev.target;
        if (target.classList.contains(kClassSelectOption)) {
          _this.inputEl.value = target.innerText;
          _this.selectedPlace = _this.placeList[Number(target.attributes.dataix.value)];
          //_this.selectionHandler(_this.selectedPlace);
        }
        this.classList.add(kClassHidden);
      }
  
      function handleHover(ev) {
        let target = ev.target;
        if (target.classList.contains(kClassSelectOption)) {
          _this.selectionListEl.querySelectorAll('.' + kClassCandidate).forEach(function (el) {
            el.classList.remove(kClassCandidate);
          });
          target.classList.add(kClassCandidate);
          ev.stopPropagation();
        }
      }
  
      //this.selectionHandler = selectionEventHandler;
      this.myGeonamesUser = geonamesUser;
  
      // create the input element and selection menu as children of the
      // attachmentElement
      let el = document.createElement('input');
      el.classList.add(kClassGeoNameInput);
      el.setAttribute('type', 'text');
      el.setAttribute('placeholder', kPlaceholderText);
      el.addEventListener('keydown', handleKeyDown);
      this.inputEl = el;
      attachmentEl.append(el);
      el = document.createElement('div');
      el.classList.add(kClassSelectList);
      el.classList.add(kClassHidden);
      el.addEventListener('mouseover', handleHover)
      el.addEventListener('click', handlePlaceNameSelection)
      el.addEventListener('keydown', handleKeyDown);
      this.selectionListEl = el;
      attachmentEl.append(el);
    }
  }



/**
 * This is the one global, a singleton, that we need or this game.
 * @type {{initialize: estimate.initialize, newGame: estimate.newGame, endGame: estimate.endGame, newTurn: estimate.newTurn, endTurn: purple_air.endTurn}}
 */
var purple_air = {

    initialize: function () {
        purple_air.state = {
            ...purple_air.default
        }
        console.log(purple_air.state)
        purple_air.setStartDate();
        purple_air.setEndDate();

        pluginHelper.initDataSet(purple_air.dataSetDescription);
    },

    generateLocationList: async function () {
        let el = document.getElementById("geonameContainer");
        new GeonameSearch(el, 'codap');
    },

    getStartDate: function () {
        let value = document.getElementById("startDate").value
        purple_air.state.startDate = value
        return value
    },

    setStartDate: function () {
        let startDate = new Date();
        let d = startDate.toLocaleString().split(",")[0].split("/")
        let startDateStr = `${d[2]}-${d[0].padStart(2, 0)}-${d[1].padStart(2, 0)}`
        document.getElementById('startDate').value = startDateStr
        document.getElementById('startDate').max = startDateStr

        purple_air.state.startDate = startDateStr
    },



    getEndDate: function () {
        let value = document.getElementById("endDate").value
        purple_air.state.endDate = value
        return value
    },

    setEndDate: function () {
        let endDate = new Date()
        let d = endDate.toLocaleString().split(",")[0].split("/")
        let endDateStr = `${d[2]}-${d[0].padStart(2, 0)}-${d[1].padStart(2, 0)}`
        document.getElementById('endDate').value = endDateStr
        document.getElementById('endDate').max = endDateStr
        purple_air.state.endDate = endDateStr
    },

    getLocationValue: function () {
        return document.getElementById("city_input").value
    },

    setLocationValue: function () {
        document.getElementById("city_input").value = ""
    },

    getLatLongValue: function () {
        return document.getElementById("lat_long_input").value
    },

    setLatLongValue: function () {
        document.getElementById("lat_long_input").value = ""
    },

    getRadiusValue: function () {
        let value = document.getElementById("radiusRange").value
        purple_air.state.radiusInMiles = value
        return value
        // document.getElementById("radiusText").value
    },

    setRadiusValue: function () {
        document.getElementById("radiusRange").value = default_radius_value
        document.getElementById("radiusText").value = default_radius_value
    },

    getMinutesValue: function () {
        let value = document.getElementById("minutes").value
        purple_air.state.averaginMinutes = value
        return value
        // document.getElementById("radiusText").value
    },

    setMinutesValue: function () {
        document.getElementById("minutes").selectedIndex = 0
    },

    getSensorNum: function () {
        let value = document.getElementById("sensor_input").value
        purple_air.state.sensorNum = value
        return value
    },

    setSensorNum: function () {
        document.getElementById("sensor_input").value = ""
    },

    clearLocationState: function () {
        purple_air.state.city = ""
        purple_air.state.state = ""
        purple_air.state.zip = ""
    },

    clearLatLongBoundingState: function () {
        purple_air.state.latitude = 0.00
        purple_air.state.longitude = 0.00
        purple_air.state.city = []
    },
    clearStartDateState: function () { },
    clearEndDateState: function () { },


    clearLocation: function () {
        purple_air.setLocationValue()
        purple_air.setLatLongValue()
        purple_air.clearLocationState()
        purple_air.clearLatLongBoundingState()

        console.info(`location Info Cleared ${purple_air.state}`)
    },

    reset: function () {
        purple_air.setLocationValue()
        purple_air.setLatLongValue()

        purple_air.setRadiusValue()

        purple_air.setStartDate()
        purple_air.setEndDate()

        purple_air.setMinutesValue()

        purple_air.setSensorNum()

        purple_air.state = {
            ...purple_air.default
        }
        console.info('Form has been reset')
        console.info(purple_air.state)
    },

    save_state: async function (city, state, zip, lat, long, bounding_box) {
        purple_air.state.city = await city
        purple_air.state.state = await state
        purple_air.state.zip = await zip
        purple_air.state.latitude = await lat;
        purple_air.state.longitude = await long;
        purple_air.state.bounding_box = await bounding_box

        console.info("State Updated ==> ")
        console.info(purple_air.state)

    },


    searchLocation: async function () {
        // console.log('search for location')
        let search = document.getElementById("city_input").value
        // document.getElementById("city_input").value = "Fetching"

        if (search === "") {
            console.log('inside')
            document.getElementById("msg").innerText = "Please enter city name to search for"
            document.getElementById("msg").style.display = "block"
        } else {
            document.getElementById("lat_long_input").value = "Fetching"
            document.getElementById("msg").style.display = "none"
            console.info('Searching Location ==> ' + search)

            let base_url = `https://api.geoapify.com/v1/geocode/autocomplete?apiKey=cd1a1690ccd74ab1ba583af1dd732ec5&text=` + search + `&type=city&lang=en&filter=countrycode:us&format=json`
            // reverse geocoding api call to geoapify
            // console.log(base_url)

            await fetch(base_url, requestOptions)
                .then(response => response.json())
                .then(response => {

                    let result = response.results[0]
                    let radiusInMiles = document.getElementById("radiusRange").value
                    let city = result.city
                    let state = result.state_code
                    let zip = result.postcode || 0
                    let lat = result.lat
                    let long = result.lon
                    let bounding_box = purple_air.getBoundsFromLatLong(lat, long, radiusInMiles * milesToKms)

                    fetch(`https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${long}&apiKey=cd1a1690ccd74ab1ba583af1dd732ec5`,
                        requestOptions)
                        .then(response => response.json())
                        .then(result => zip = result.features[0].properties.postcode)
                        .catch(error => console.log('error', error));

                    setTimeout(() => {
                        purple_air.save_state(city, state, zip, lat, long, bounding_box)
                        document.getElementById('lat_long_input').value = `${lat}, ${long}`
                        document.getElementById('city_input').value = `${city}, ${state}`
                    }, 500);

                })
                .catch(error => console.log('error', error));
        }
    },

    getFormData: function () {
        // data = {}
        // data.location = this.getLocationValue()
        // data.LatLong = this.getLatLongValue()
        // data.radiusInMiles = this.getRadiusValue() 
        // data.startDate = this.getStartDate()
        // data.endDate = this.getEndDate()
        // data.averaginMinutes = this.getMinutesValue()
        // console.log(purple_air.state)
        console.log(purple_air.state)
    },


    showError: function (message) {
        document.getElementById("msg").innerText = message
        document.getElementById("msg").style.display = "block"
    },

    showSccuess: function (message) {
        document.getElementById("msg").innerText = message
        document.getElementById("msg").style.display = "block"
    },

    hideError: function () {
        document.getElementById("msg").innerText = ""
        document.getElementById("msg").style.display = "none"
    },

    setSpinnerText: function (text) {
        document.getElementById("spinner_text").innerText = text
    },

    setDateText: function (text) {
        document.getElementById("date_text").innerText = text
    },

    setSensorList: function (count) {
        document.getElementById("sensor_list").innerText = `Found ${count} sensor(s)`
    },

    disable_form_input: function () {
        document.getElementById("spinner").style.display = 'block'
        document.getElementById("")

        document.getElementById("city_input").disabled = "disabled"
        // document.getElementById("lat_long_input").disabled = "disabled"
        document.getElementById("clearLocation").disabled = "disabled"
        document.getElementById("searchLocation").disabled = "disabled"
        document.getElementById("radiusRange").disabled = "disabled"
        document.getElementById("startDate").disabled = "disabled"
        document.getElementById("endDate").disabled = "disabled"
        document.getElementById("minutes").disabled = "disabled"
        document.getElementById("reset").disabled = "disabled"
        document.getElementById("getPurpleAirData").disabled = "disabled"
    },
    enable_form_input: function () {
        document.getElementById("spinner").style.display = 'none'
        document.getElementById("city_input").disabled = ""
        // document.getElementById("lat_long_input").disabled = True
        document.getElementById("clearLocation").disabled = ""
        document.getElementById("searchLocation").disabled = ""
        document.getElementById("radiusRange").disabled = ""
        document.getElementById("startDate").disabled = ""
        document.getElementById("endDate").disabled = ""
        document.getElementById("minutes").disabled = ""
        document.getElementById("reset").disabled = ""
        document.getElementById("getPurpleAirData").disabled = ""
    },

    getAQIfromPM: function (pm) {
        if (isNaN(pm)) return "-";
        if (pm == undefined) return "-";
        if (pm < 0) return pm;
        if (pm > 1000) return "-";
        /*      
              Good                              0 - 50         0.0 - 15.0         0.0 – 12.0
        Moderate                        51 - 100           >15.0 - 40        12.1 – 35.4
        Unhealthy for Sensitive Groups   101 – 150     >40 – 65          35.5 – 55.4
        Unhealthy                                 151 – 200         > 65 – 150       55.5 – 150.4
        Very Unhealthy                    201 – 300 > 150 – 250     150.5 – 250.4
        Hazardous                                 301 – 400         > 250 – 350     250.5 – 350.4
        Hazardous                                 401 – 500         > 350 – 500     350.5 – 500
        */
        if (pm > 350.5) {
            return purple_air.calcAQI(pm, 500, 401, 500, 350.5);
        } else if (pm > 250.5) {
            return purple_air.calcAQI(pm, 400, 301, 350.4, 250.5);
        } else if (pm > 150.5) {
            return purple_air.calcAQI(pm, 300, 201, 250.4, 150.5);
        } else if (pm > 55.5) {
            return purple_air.calcAQI(pm, 200, 151, 150.4, 55.5);
        } else if (pm > 35.5) {
            return purple_air.calcAQI(pm, 150, 101, 55.4, 35.5);
        } else if (pm > 12.1) {
            return purple_air.calcAQI(pm, 100, 51, 35.4, 12.1);
        } else if (pm >= 0) {
            return purple_air.calcAQI(pm, 50, 0, 12, 0);
        } else {
            return undefined;
        }
    },

    getAQIDescription: function (aqi) {
        if (aqi >= 401) {
            return 'Hazardous';
        } else if (aqi >= 301) {
            return 'Hazardous';
        } else if (aqi >= 201) {
            return 'Very Unhealthy';
        } else if (aqi >= 151) {
            return 'Unhealthy';
        } else if (aqi >= 101) {
            return 'Unhealthy for Sensitive Groups';
        } else if (aqi >= 51) {
            return 'Moderate';
        } else if (aqi >= 0) {
            return 'Good';
        } else {
            return undefined;
        }
    },

    calcAQI: function (Cp, Ih, Il, BPh, BPl) {

        var a = (Ih - Il);
        var b = (BPh - BPl);
        var c = (Cp - BPl);
        return Math.round((a / b) * c + Il);

    },


    getDaysArray: function (start, end) {
        for (var arr = [], dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
            arr.push((new Date(dt)).toJSON().slice(0, 10));
        }
        return arr;
    },



    getElevationFromLatLong: async function (latLngList) {
        // function getData(ajaxurl) { 
        //     return $.ajax({
        //       url: ajaxurl,
        //       type: 'GET',
        //     });
        //   };

        // const URL = `https://api.opentopodata.org/v1/test-dataset?locations=${latLngList}`

        // try {
        //     const response = await getData(URL)
        //     let elevationList = []
        //     let status = await response["status"]
        //     let results = await response["results"]
        //     if (status === "OK"){
        //         await results.forEach(element => {
        //                 elevationList.push(element.elevation)
        //             });
        //         console.info("elevation data fetched successfully")
        //         return elevationList
        //     }
        //     else{
        //         console.error("elevation fetch failed")
        //         return []; // returns empty list if request did not succed
        //     }
        // } catch(err) {
        //     console.log(err);
        // }
        return []
    },


    getPurpleAirAPIData: async function () {
        const api_key = "CA299E4B-82DF-11EC-B9BF-42010A800003"

        // const FIELDS_REQD = 'name,primary_id_a,primary_key_a,latitude,longitude'
        const FIELDS_REQD = 'name,latitude,longitude'
        const [selat, selng, nwlat, nwlng] = purple_air.state.bounding_box

        const BASE_PURPLE_AIR_URL = `https://api.purpleair.com/v1/sensors?api_key=${api_key}&fields=${FIELDS_REQD}&selat=${selat}&selng=${selng}&nwlat=${nwlat}&nwlng=${nwlng}`

        // let latLngList = []

        // const purple_air_fields =   {
        //     sensor_index: "",
        //     name: "",
        //     primary_id_a: "",
        //     primary_key_a: "",
        //     latitude: "",
        //     longitude: ""
        // }

        const purple_air_fields = {
            sensor_index: "",
            name: "",
            latitude: "",
            longitude: ""
        }

        let sensorValues = []

        let fetch_purple_air = await (await fetch(BASE_PURPLE_AIR_URL)).json()

        let data = fetch_purple_air.data

        let totalReqSensors = purple_air.state.sensorNum || 0
        let recordsCount = 0;

        for (let d of data) {
            let newRow = { ...purple_air_fields }
            newRow.Location = purple_air.state.city
            newRow.sensor_index = d[0]
            newRow.name = d[1]
            // newRow.primary_id_a =   d[2]
            // newRow.primary_key_a =  d[3]
            newRow.latitude = d[2]
            newRow.longitude = d[3]
            // latLngList.push( `${d[2]},${d[3]}` )
            sensorValues.push(newRow)

            // Keep count of the sensor records read and terminate if max cap is reached
            recordsCount = recordsCount + 1; 
            if(totalReqSensors > 0 && recordsCount >= totalReqSensors){
                break;
            }
        }

        // if (flag === 1) {        console.log(sensorValues)        }

        return sensorValues

    },

    getThingSpeakData: async function (purpleAirData) {
        let answers = []
        let i = 1
        let n = purpleAirData.length

        if (flag === 1) {
            console.info("ThingsSpeak Function")
            console.info(purpleAirData)
        }
        const api_key = "CA299E4B-82DF-11EC-B9BF-42010A800003"

        for (let sensor of purpleAirData) {
            purple_air.setSpinnerText(`Sensor ${i}/${n} - ${sensor.name}`)
            // console.log(sensor.name)

            let dates = purple_air.getDaysArray(
                (new Date(purple_air.state.startDate)),
                (new Date(purple_air.state.endDate))
            )


            for (let date of dates) {
                purple_air.setDateText(`Fetching Date ${date}`)
                const base_url_b = `https://api.purpleair.com/v1/sensors/${sensor.sensor_index}` +
                    `/history?fields=temperature,humidity,pm2.5_cf_1,pm10.0_atm` +
                    `&start_timestamp=${new Date(date + "T00:00:00.000Z").getTime() / 1000}` +
                    `&end_timestamp=${new Date(date + "T24:00:00.000Z").getTime() / 1000}` +
                    `&average=${purple_air.state.averaginMinutes}`
                // const base_url_a = `https://api.thingspeak.com/channels/${sensor.primary_id_a}/feed.json?api_key=${sensor.primary_key_a}&offset=0&average=${purple_air.state.averaginMinutes}&round=2&start=${date}%2000:00:00&end=${date}%2023:59:59&results=8000&timezone=America/Phoenix`
                let sa = await (await fetch(base_url_b, {
                    headers: {
                        "X-API-Key": api_key
                    }
                })).json()

                let data = sa.data
                let dateObj = new Date()
                data.forEach((element, index) => {
                    dateObj.setTime(element[0] * 1000)
                    answers.push({
                        // "entry_id": index,
                        "created_at": dateObj.toISOString(),
                        "Humidity": element[1],
                        "Temperature": element[2] + " °F",
                        "PM 2.5": element[3],
                        "PM 10.0": element[4],
                        "AQI": purple_air.getAQIfromPM(element[4]),
                        ...sensor
                    })
                });
            }
            i = i + 1
        }
        return answers

    },

    getPurpleAirData: async function () {
        try {
            // let search = document.getElementById("city_input").value
            console.info("*****state*****")
            console.info(purple_air.state)

            if (purple_air.state.city === "" || (purple_air.state.latitude === 0.00 && purple_air.state.longitude === 0.00)) {
                let msg = "Please fetch & search your desired location before moving forward"
                console.warn(msg)
                purple_air.showError(msg)
            }
            // else if (purple_air.radiusInMiles ){}
            else if (purple_air.state.startDate === "") {
                let msg = "Please select start date before moving forward"
                purple_air.showError(msg)
                console.warn(msg)
            } else if (purple_air.state.endDate === "") {
                let msg = "Please select end date before moving forward"
                purple_air.showError(msg)
                console.warn(msg)
            } else if (purple_air.state.averaginMinutes === 0) {
                let msg = "Please select averging minutes before moving forward"
                purple_air.showError(msg)
                console.warn(msg)
            } else {

                purple_air.disable_form_input()

                console.info('fetchin data from purple air api')
                purple_air.setSpinnerText("Fetching Data from Purple Air")


                let purpleAirData = await purple_air.getPurpleAirAPIData()
                purple_air.setSensorList(purpleAirData.length)

                if (flag === 1) { console.log(purpleAirData) }

                let thingSpeakData = await purple_air.getThingSpeakData(purpleAirData)
                if (flag === 1) { console.info(thingSpeakData) }

                pluginHelper.createItems(thingSpeakData)
                this.createMapComponent()
                this.createCaseTable("dataset")
                purple_air.enable_form_input()
            }
        } catch (error) {
            document.getElementById("spinner").style.display = 'none'
            purple_air.showError(`Error\n${error}\n\nPlease refresh the window & try again - if the error persists - email us a screenshot of this window @ puple.air.codap.support@asu.edu\n`)
        }

    },

    /**
     * 
     * @param {takes in the latitude for a location} lat 
     * @param {takes in the longitude for a location} long 
     * @param {takes in the radius in kilometers for a location} radiusInKms 
     * @returns a bounding box array lat min, long max, lat max, long min (adjusted according to the purple air api results)
     */
    getBoundsFromLatLong: function (lat, long, radiusInKms) {
        var lat_change = radiusInKms / 111.2
        var long_change = Math.abs(Math.cos(lat * (Math.PI / 180)))

        var bounds = {
            lat_min: lat - lat_change,
            long_max: long + long_change,
            lat_max: lat + lat_change,
            long_min: long - long_change
        }
        // console.log(bounds)
        return [
            bounds.lat_min,
            bounds.long_max,
            bounds.lat_max,
            bounds.long_min
        ]
    },

    changeRadius: async function (value) {

        let lat = purple_air.state.latitude
        let long = purple_air.state.longitude
        if (lat === 0.00 || long === 0.00) {
            document.getElementById("msg").innerText = "Please fetch / search your desired location before moving forward"
            document.getElementById("msg").style.display = "block"
        } else {
            let radiusInMiles = value
            let bounding_box = await purple_air.getBoundsFromLatLong(lat, long, radiusInMiles * milesToKms)
            console.info('Radius Changed')
            purple_air.state.bounding_box = bounding_box
            purple_air.state.radiusInMiles = value
            console.log(purple_air.state)
        }
    },

    createMapComponent: function (datasetName) {
        return codapInterface.sendRequest({
            "action": "create",
            "resource": "component",
            "values": {
                "type": "map",
                "name": myMAP,
                "title": "map",
                "dataContextName": "purple air",
                "legendAttributeName": "Legend",
                "dimensions": {
                    width: 380,
                    height: 380
                }

            }
        }).then(function (result) {
            console.log("Map openend")
            // console.log(result);

        });
    },

    createCaseTable: function (datasetName) {
        return codapInterface.sendRequest({
            action: 'create',
            resource: `component`,
            values: {
                type: "caseTable",
                dataContext: datasetName,
                "dimensions": {
                    width: 1000,
                    height: 800
                }
            }
        })
            .then(function (result) {
                // console.log(result)
                if (result.success) {
                    let componentID = result.values.id;
                    if (componentID) {
                        return codapInterface.sendRequest({
                            action: 'notify',
                            resource: `component[${componentID}]`,
                            values: {
                                request: 'autoScale',
                                "position": "bottom"
                            }
                        })
                    }
                }
            });
    }
};


/**
 * Called when the user selects a case (or cases) in CODAP
 * We deal with this in session 2.
 * @param iMessage
 */
purple_air.codapSelects = function (iMessage) { //  |N| part of session 2 solution
    var tMessageValue = iMessage.values;
    if (Array.isArray(tMessageValue)) {
        tMessageValue = tMessageValue[0]; //      the first of the values in the message
    }
    console.log("Received a " + tMessageValue.operation + " message");
};

/**
 * The "state" member variable.
 * Anything you want saved and restored that is NOT in CODAP, you put here,
 * @type {{playerName: string, lastClickPosition: number, lastInputNumber: number, gameNumber: number, turnNumber: number, currentScore: number, currentTruth: number, playing: boolean, restored: boolean}}
 */
purple_air.state = {
    latitude: 0.00,
    longitude: 0.00,
    city: "",
    state: "",
    zip: "",
    bounding_box: [],
    radiusInMiles: default_radius_value,
    startDate: "",
    endDate: "",
    averaginMinutes: 0,
    sensorNum: 0
};

purple_air.default = {
    latitude: 0.00,
    longitude: 0.00,
    city: "",
    state: "",
    zip: "",
    bounding_box: [],
    radiusInMiles: default_radius_value,
    startDate: "",
    endDate: "",
    averaginMinutes: 0,
    sensorNum: 0
}

// purple_air.state = {
//     "latitude": 35.1987522,
//     "longitude": -111.6518229,
//     "city": "Flagstaff",
//     "state": "AZ",
//     "zip": 0,
//     "bounding_box": [
//       35.054027379856116,
//       -110.83466544818978,
//       35.34347702014389,
//       -112.46898035181022
//     ],
//     "radiusInMiles": 10,
//     "startDate": "2022-03-21",
//     "endDate": "2022-03-21",
//     "averaginMinutes": 60
//   }

// purple_air.default = {
//     "latitude": 35.1987522,
//     "longitude": -111.6518229,
//     "city": "Flagstaff",
//     "state": "AZ",
//     "zip": 0,
//     "bounding_box": [
//       35.054027379856116,
//       -110.83466544818978,
//       35.34347702014389,
//       -112.46898035181022
//     ],
//     "radiusInMiles": 10,
//     "startDate": "2022-03-21",
//     "endDate": "2022-03-21",
//     "averaginMinutes":60
//   }


/**
 * A convenient place to stash constants
 * @type
 */
purple_air.constants = {
    version: "001"
};


/**
 * Constant object CODAP uses to initialize our data set (a.k.a. Data Context)
 *
 * @type {{name: string, title: string, description: string, collections: [*]}}
 */
purple_air.dataSetDescription = {
    name: "dataset",
    title: "Purple Air Table",
    description: "A set of values including humidity, precipitation, temperature, pm2.5 & pm10.0, AQI",
    dimensions: {
        width: 1000,
        height: 500
    },
    collections: [
        {
            name: "Search",
            parent: null, //  this.gameCollectionName,    //  this.bucketCollectionName,
            labels: {
                singleCase: "location",
                pluralCase: "locations",
                setOfCasesWithArticle: "Set of locations"
            },
            attrs: [
                {
                    "name": "Location",
                    "type": "Categorical",
                    "description": "user's searched location / current location"
                }
            ]
        },

        {
            name: "Sensors",
            parent: "Search", //  this.gameCollectionName,    //  this.bucketCollectionName,
            labels: {
                singleCase: "sensor",
                pluralCase: "sensors",
                setOfCasesWithArticle: "Set of Values"
            },

            attrs: [
                {
                    name: "sensor_index",
                    type: 'numeric',
                    description: "Sensors id"
                },
                {
                    name: "name",
                    type: 'categorical',
                    description: "Sensors Name"
                },
                {
                    name: "latitude",
                    type: 'numeric',
                    description: "sensor's latitude"
                },
                {
                    name: "longitude",
                    type: 'numeric',
                    description: "sensor's longitude"
                }
                ,
                {
                    name: "elevation",
                    type: 'numeric',
                    description: "sensor's elevation"
                },
            ]
        },
        {
            "name": "Sensor Data",
            "title": "List of Measures",
            "parent": "Sensors",
            "labels": {
                "singleCase": "measure",
                "pluralCase": "measures"
            },
            "attrs": [{
                name: "created_at",
                type: 'date',
                description: "date created data"
            },
            {
                name: "Humidity",
                type: 'numeric',
                precision: 3,
                description: "estimated value"
            },
            {
                name: "Temperature",
                type: 'text',
                //precision: 3,
                description: "estimated value"
            },
            {
                name: "PM 10.0",
                type: 'numeric',
                precision: 3,
                description: "estimated value of Particulate Matter 10.0"
            },
            {
                name: "PM 2.5",
                type: 'numeric',
                precision: 3,
                description: "estimated value of Particulate Matter 2.5"
            },
            {
                name: "AQI",
                type: 'numeric',
                precision: 3,
                description: "Air Quality Index"
            }

            ]
        }
    ]
};
