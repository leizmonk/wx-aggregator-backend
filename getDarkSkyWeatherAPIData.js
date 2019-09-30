"use strict";
const AWS = require("aws-sdk")
AWS.config.update({region:'us-west-2'})
const https = require("https")
const lambda = new AWS.Lambda()
const moment = require("moment")
const Promise = require("bluebird")
const s3 = new AWS.S3()
const util = require("util")
const inspect = util.inspect

const darkSkyApiKey = process.env.darkSkyApiKey

module.exports.getDarkSkyWeatherAPIData = (reactInput, context, callback) => {
  console.log(`*** OBJECT CONTAINING ZIP CODE, LATLNG, TIMESTAMP: ${inspect(reactInput)} ***`)  
  let weatherService = 'darksky'; // TODO: Make a for loop for N weather services
  let forecast;
  let forecastLastModified;
  let payload;

  const zipcodeJsonKey = reactInput.zipCode + ".json";
  const s3PutParams = {Bucket: "wx-aggregator", Key: `forecast_data/${weatherService}`}
  const s3GetParams = {Bucket: "wx-aggregator", Key: `forecast_data/${weatherService}/${zipcodeJsonKey}`}  

  async function checkForExistingForecast(forecast, forecastLastModified, reactInput) {
    // Look in wx-aggregator/forecast_data, iteratively check weather service folders
    // in each weather service folder, check if zipCode.json exists

    // Check if S3 already has forecast data across all services for that zipcode
    // TODO: why is this logging twice
    await s3.getObject(s3GetParams, (err, data) => {
      try {
        console.log('THIS BE THE ZIPCODE KEY::::::: ', zipcodeJsonKey)
        console.log('THIS BE THE TIMESTAMP:::::::::::', data ? data.LastModified : 'forecast not saved yet')
        forecast = data ? data.Body : null
        forecastLastModified = data ? data.LastModified : null
        return (forecast, forecastLastModified)
      } catch (err) {
        console.log('ERROR WAS::::::', err, err.stack)
        console.log(`Forecast for that JSON not found, downloading forecast for that zipcode from ${weatherService} weather service.`);
      }
    }).promise()
  }
  
  async function checkForecastStaleness(forecast, forecastLastModified, reactInput) {
    // If forecast data exists and is less than 6 hours older than search event in React app
    if (forecast && moment(reactInput.time).isBefore(moment(forecastLastModified).add(6, 'hours'))) {
      console.log('Forecast for this ZIP already exists, and is less than 6 hours old')
      return forecast;
    } else {
      forecast = await fetchDarkSkyAPIData(reactInput); // TODO: Iterative over multiple weather forecasters
      let uploadJsonResponse = await createNewJSONOfLatestDataInS3(s3PutParams, forecast, reactInput.zipCode);
      return forecast;
    }    
  }

  function fetchDarkSkyAPIData (reactInput) {
    return new Promise((resolve, reject) => {
      https.get(
        {
          host: "api.darksky.net",
          path: "/forecast/" + darkSkyApiKey + '/' + reactInput.latLng
        },
        (res) => {
          let apiPayload = ''

          res.on('data', (data) => {
            apiPayload += data
          })
          res.on('end', data => {
            resolve(apiPayload)
          })
        }
      ).on('error', err => {
        console.log(err)
      })
    })
  }

  // needs to ingest ZIP to create the zip.json, weather service vars
  function createNewJSONOfLatestDataInS3(s3PutParams, weatherJSONData, zipCode) {
    console.log(`Fetched raw payload from external API: ${weatherJSONData}`)
    s3.putObject(
      {
        Bucket: "wx-aggregator",
        // Key needs to be forecast_data/{weather service}/{zipCode}.json
        Key: `forecast_data/${weatherService}/${zipcodeJsonKey}`,
        Body: JSON.stringify(weatherJSONData)
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

  checkForExistingForecast(reactInput).catch(function(e) {
    // ignore error
  }).then((forecast, forecastLastModified, reactInput) => {
    checkForecastStaleness(forecast, forecastLastModified, reactInput)
    console.log('after a catch the chain is restored');
  }, () => {
    console.log('Not fired due to the catch');
  });

  // try {
  //   fetchDarkSkyAPIData()
  //     .then((weatherJSONData) => {
  //       return s3.getObject(params, (err, data) => {
  //         if (err) {
  //           // weather data json file doesn"t exist, create it and write to it
  //           createNewJSONOfLatestWeatherDataInS3(
  //             {
  //               Bucket: "wx-aggregator",
  //               Key: "forecast_data/darksky/forecastResults.json",
  //               Body: weatherJSONData
  //             },
  //             weatherJSONData)
  //             let response = 
  //             callback(null, {
  //               statusCode: 200,
  //               headers: {
  //                 "x-custom-header" : "hey ma look no hands"
  //               },
  //               body: JSON.stringify(weatherJSONData)
  //             })
  //         } else {
  //           console.log('Existing JSON detected. Deleting Old Weather Data...')
  //             // Insert latest data in a new file on the s3 bucket
  //             createNewJSONOfLatestWeatherDataInS3(
  //               {
  //                 Bucket: "wx-aggregator",
  //                 Key: "forecast_data/darksky/forecastResults.json",
  //                 Body: weatherJSONData
  //               },
  //               weatherJSONData
  //             )
  //             callback(null, {
  //               statusCode: 200,
  //               headers: {
  //                 "x-custom-header" : "hey ma look no hands"
  //               },
  //               body: JSON.stringify(weatherJSONData)      
  //             });
  //         }
  //       })
  //   })
  // }
  // catch(err) {
  //   callback(err)
  // }
}
