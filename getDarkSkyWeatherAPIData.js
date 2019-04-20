"use strict";
const https = require("https")
const AWS = require("aws-sdk")
AWS.config.update({region:'us-west-2'})
const Promise = require("bluebird")
const lambda = new AWS.Lambda()
const moment = require("moment")
const util = require("util")
const inspect = util.inspect
const darkSkyApiKey = process.env.darkSkyApiKey

const s3 = new AWS.S3()
const params = {params: {Bucket: "wx-aggregator", Key: "darkSkyWeatherData"}}

module.exports.getDarkSkyWeatherAPIData = (event, context, callback) => {
  async function checkForExistingForecast(zip, reactTimestamp) {
    // Look in wx-aggregator/forecast_data, iteratively check weather service folders
    // in each weather service folder, check if ZIP.json exists
    const zipcodeJsonKey = zip + ".json";
    let weatherService = 'darksky'; // TODO: Make a for loop for N weather services
    let forecast;
    let forecastLastModified;

    // Check if S3 already has forecast data across all services for that zipcode
    await s3.getObject({
      Bucket: "wx-aggregator",
      Key: `forecast_data/${weatherService}/${zipcodeJsonKey}` // TODO: Iterative over multiple weather forecasters
    }, (err, data) => {
      if (err) {
        console.log(`Forecast for that JSON not found, downloading forecast for that zipcode from ${weatherService} weather service.`);
      } else {
        forecast = data.Body;
        forecastLastModified = data.LastModified;
      }
    });

    if (
      forecast && 
      moment(reactTimestamp).isBefore(moment(forecastLastModified).add(6, 'hours'))
    ) { // Six hours from when search submit occurs in React app
      return forecast;
    } else {
      forecast = await fetchDarkSkyAPIData(); // TODO: Iterative over multiple wather forecasters
      let uploadJsonResponse = await createNewJSONOfLatestDataInS3(s3Params, forecast);
      return forecast;
    }
  }

  // TODO: First, inspect event object and see where the zipcode and timestamp
  console.log(`*** OBJECT CONTAINING ZIP CODE AND TIMESTAMP: ${inspect(event)} ***`)  
  
  function fetchDarkSkyAPIData () {
    return new Promise((resolve, reject) => {
      https.get(
        {
          host: "api.darksky.net",
          path: "/forecast/" + darkSkyApiKey + "/40.75658383859137,-73.83024611523439"
        },
        (res) => {
          let payload = ''

          res.on('data', (data) => {
            payload += data
          })
          res.on('end', data => {
            resolve(payload)
          })
        }
      ).on('error', err => {
        console.log(err)
      })
    })
  }

  function createNewJSONOfLatestWeatherDataInS3(s3Params, weatherJSONData) {
    console.log(`Fetched raw payload from external API: ${weatherJSONData}`)
    s3.putObject(
      {
        Bucket: "wx-aggregator",
        Key: "forecast_data/darksky/forecastResults.json",
        Body: weatherJSONData
      }, 
      (err) => {
        if (err) {
          console.log(`Error uploading weather API data to S3 json file: ${err, err.stack}`)
          throw err
        } else {
          console.log("Successfully uploaded latest weather data to JSON")
        }
      }
    )
  }

  try {
    fetchDarkSkyAPIData()
      .then((weatherJSONData) => {
        return s3.getObject(params, (err, data) => {
          if (err) {
            // weather data json file doesn"t exist, create it and write to it
            createNewJSONOfLatestWeatherDataInS3(
              {
                Bucket: "wx-aggregator",
                Key: "forecast_data/darksky/forecastResults.json",
                Body: weatherJSONData
              },
              weatherJSONData)
              let response = 
              callback(null, {
                statusCode: 200,
                headers: {
                  "x-custom-header" : "hey ma look no hands"
                },
                body: JSON.stringify(weatherJSONData)      
              })
          } else {
            console.log('Existing JSON detected. Deleting Old Weather Data...')
              // Insert latest data in a new file on the s3 bucket
              createNewJSONOfLatestWeatherDataInS3(
                {
                  Bucket: "wx-aggregator",
                  Key: "forecast_data/darksky/forecastResults.json",
                  Body: weatherJSONData
                },
                weatherJSONData
              )
              callback(null, {
                statusCode: 200,
                headers: {
                  "x-custom-header" : "hey ma look no hands"
                },
                body: JSON.stringify(weatherJSONData)      
              });
          }
        })
    })
  }
  catch(err) {
    callback(err)
  }
}


