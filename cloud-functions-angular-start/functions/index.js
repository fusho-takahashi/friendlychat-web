/**
 * Copyright 2017 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// TODO(DEVELOPER): Import the Cloud Functions for Firebase and the Firebase Admin modules here.
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp(functions.config().firebase);

const Storage = require("@google-cloud/storage");
const vision = require("@google-cloud/vision");
const exec = require("child-process-promise").exec;

const visionClient = new vision.ImageAnnotatorClient();
const storageClient = new Storage();

// TODO(DEVELOPER): Write the addWelcomeMessages Function here.
exports.addWelcomeMessages = functions.auth.user().onCreate(user => {
  console.log("A new user signed in for the first time");

  const fullName = user.displayName || "Anonymous";

  return admin
    .database()
    .ref("messages")
    .push({
      name: "Firebase Bot",
      photoUrl: "/assets/images/firebase-logo.png",
      text: `${fullName} signed in for the first time! Welcome!`
    });
});
// TODO(DEVELOPER): Write the blurOffensiveImages Function here.
exports.blurOffensiveImages = functions.storage.object().onFinalize(object => {
  if (object.resourceState === "no_exist") {
    return console.log("This is a deletion event");
  } else if (!object.name) {
    return console.log("This is a deploy event");
  }

  const messageId = object.name.split("/")[1];

  return admin
    .database()
    .ref(`/messages/${messageId}/moderated`)
    .once("value")
    .then(snapshot => {
      if (snapshot.val()) {
        return;
      }

      return visionClient.safeSearchDetection(
        `gs://${object.bucket}/${object.name}`
      );
    })
    .then(results => {
      if (!results) {
        return;
      }
      const detections = results[0].safeSearchAnnotation;
      if (detections.adult || detections.violence) {
        console.log(
          "The image",
          object.name,
          "has been detected as inappropriate"
        );
        return this.blurOffensiveImages(object);
      } else {
        console.log("The image", object.name, "has been detected as OK.");
      }
    });
});

function blurImage(object) {
  const filePath = object.name;
  const bucket = storageClient.bucket(object.bucket);
  const fileName = filePath.split("/").pop();
  const tempLocalFile = `/tmp/${fileName}`;
  const messageId = filePath.split("/")[1];

  return bucket
    .file(filePath)
    .download({ destination: tempLocalFile })
    .then(() => {
      console.log("Image has been downloaded to", tempLocalFile);
      return exec(
        `convert ${tempLocalFile} -channel RGBA -blur 0x24 ${tempLocalFile}`
      );
    })
    .then(() => {
      console.log("Image has been blurred");
      return bucket.upload(tempLocalFile, { destination: filePath });
    })
    .then(() => {
      console.log("Blurred image has been uploaded to", filePath);
      return admin
        .database()
        .ref(`messages/${messageId}`)
        .update({ moderated: true });
    })
    .then(() => {
      console.log("Marked the image as moderated in the database.");
    });
}

// TODO(DEVELOPER): Write the sendNotifications Function here.

// (OPTIONAL) TODO(DEVELOPER): Write the annotateMessages Function here.
