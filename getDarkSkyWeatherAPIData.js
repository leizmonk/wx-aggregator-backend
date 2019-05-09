"use strict";
const AWS = require("aws-sdk")
AWS.config.update({region:'us-west-2'})
const https = require("https")
const lambda = new AWS.Lambda()
const moment = require("moment")
const Promise = require("bluebird")
const util = require("util")
const inspect = util.inspect

const darkSkyApiKey = process.env.darkSkyApiKey
const s3 = new AWS.S3()
const s3Params = {params: {Bucket: "wx-aggregator", Key: "darkSkyWeatherData"}}

module.exports.getDarkSkyWeatherAPIData = (reactInput, context, callback) => {
  console.log(`*** OBJECT CONTAINING ZIP CODE, LATLNG, TIMESTAMP: ${inspect(reactInput)} ***`)  
  let weatherService = 'darksky'; // TODO: Make a for loop for N weather services
  const zipcodeJsonKey = reactInput.zipCode + ".json";

  async function checkForExistingForecast(reactInput) {
    // Look in wx-aggregator/forecast_data, iteratively check weather service folders
    // in each weather service folder, check if zipCode.json exists
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

    // If forecast data exists and is less than 6 hours older than search event in React app
    if (forecast && moment(time).isBefore(moment(forecastLastModified).add(6, 'hours'))) {
      console.log('Forecast for this ZIP already exists, and is less than 6 hours old')
      return forecast;
    } else {
      forecast = await fetchDarkSkyAPIData(reactInput); // TODO: Iterative over multiple wather forecasters
      let uploadJsonResponse = await createNewJSONOfLatestDataInS3(s3Params, forecast, reactInput.zipCode);
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
  function createNewJSONOfLatestDataInS3(s3Params, weatherJSONData) {
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

  checkForExistingForecast(reactInput);

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
