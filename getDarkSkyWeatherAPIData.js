"use strict";
const https = require("https")
const AWS = require("aws-sdk")
AWS.config.update({region:'us-west-2'})
const Promise = require("bluebird")
const lambda = new AWS.Lambda()
const util = require("util")
const inspect = util.inspect
const darkSkyApiKey = process.env.darkSkyApiKey

const s3 = new AWS.S3()
const params = {params: {Bucket: "wx-aggregator", Key: "darkSkyWeatherData"}}

module.exports.getDarkSkyWeatherAPIData = (event, context, callback) => {
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
        Key: "/forecast_data/darksky/forecastResults.json",
        Body: weatherJSONData
      }, 
      (err) => {
        if (err) {
          console.log(`Error uploading weather API data to S3 json file: ${err}`)
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
                Key: "/forecast_data/darksky/forecastResults.json",
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
                  Key: "/forecast_data/darksky/forecastResults.json",
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