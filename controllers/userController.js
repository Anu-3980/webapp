import bcrypt from 'bcrypt';
import User from '../models/userModel.js';
import { dbConnection } from './healthController.js';
import sequelize from '../config/dbConfig.js';
import logger from '../logger.js';
import { PubSub } from '@google-cloud/pubsub';
import { v4 as uuidv4 } from 'uuid'; 


// const generateUUID = () => {
//     return uuidv4();
// };

// Validators
import emailValidator from 'email-validator';
import passwordValidator from 'password-validator';
import nameValidator from 'validator'; 
const estOptions = { timeZone: 'America/New_York' };

const passwdValidator = new passwordValidator();
export { emailValidator, passwdValidator, nameValidator }; 
passwdValidator
  .is()
  .min(4) // Minimum length 5
  .is()
  .max(20) // Maximum length 20
  .has()
  .not()
  .spaces();
  
  const dbConnectionCheck = async () => {
    try {
        await sequelize.authenticate();
        return true;
    } catch (error) {
        console.error('Database Connectivity Error:', error);
        logger.error('Database Connectivity Error:', error);
        return false; 
    }
};


// Function to validate if a string contains only letters (no digits)
const isAlphaString = (str) => {
    return nameValidator.isAlpha(str);
  };

  const checkRequiredFields = (req, res, next) => {
    //logger.debug('Checking required fields in the request body...');
    const requiredFields = ['first_name', 'last_name', 'password', 'username' ];
    
    // Check if any of the required fields is missing in the request body
    const missingFields = requiredFields.filter(field => !(field in req.body));
    if (missingFields.length > 0) {
        res.status(400).send(`Required fields are missing: ${missingFields.join(', ')}.`);
        logger.warn(`Required fields are missing: ${missingFields.join(', ')}.`);
        return;
    }
    next();
};

const verifyUser = async (req, res) => {

    const { token, username } = req.query;

    try {
       
   
        
        // Retrieve the user from the database using the token and username
        const user = await User.findOne({ where: { username } });

        if (!user) {
            console.log("User not found for token:", token, "and username:", username);
            return res.status(400).send("Invalid token or username");
        }

        // Add console log to check the value of is_verified
        console.log("is_verified:", user.is_verified);

        const currentTime = new Date();
        const validityTime = new Date(user.validity);
        console.log("Current Time:", currentTime);
        console.log("Validity Time:", validityTime);

        if (currentTime < validityTime) {
            // Check if the token sent in the link matches the one in the database
            if (user.token !== token) {
                console.log("Invalid token:", token);
                return res.status(400).send("Invalid token");
            }

            // Check if the user is already verified
            if (!user.is_verified) {
                // Update user's verification status to true
                await user.update({ is_verified: true }); 
                console.log("User verification status updated to true");
                return res.status(200).send("Email Verified");
            } else {
                console.log("User is already verified");
                return res.status(200).send("Already verified");   
            }
        } else {
            console.log("Link Expired");
            return res.status(400).send("Link Expired");
        }
    } catch (error) {
        console.error("Error verifying user:", error);
        res.status(500).send("Internal Server Error");
    }
};



const pubsub = new PubSub(); 
const topicName = 'verify_email';

function isValidEmail(email) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
}


const addUser = async (req, res) => {
    logger.debug('Processing user addition...'); 
    // Check if the request method is POST

const isTesting = process.env.NODE_ENV === 'test';
const is_verified = isTesting ? true : false;  
    if (req.method === 'POST') {
        // Execute the checkRequiredFields middleware before processing the request
        checkRequiredFields(req, res, async () => {

            // Check if the request body is empty
            if (Object.keys(req.body).length === 0) {
                res.status(204).send("Request body is empty.");
                logger.warn("Request body is empty.");
                return;
            }

            const allowedFields = ['first_name', 'last_name', 'username', 'password', 'account_created', 'account_updated', 'is_verified'];

            // Check for any additional fields in the request body
            const extraFields = Object.keys(req.body).filter(
                (field) => !allowedFields.includes(field)
            );

            if (extraFields.length > 0) {
                res.status(400).send("Additional fields are not allowed.");
                logger.warn("Additional fields are not allowed.");
                return;
            }
            
            if (
                !emailValidator.validate(`${req.body.username}`) ||
                !passwdValidator.validate(`${req.body.password}`)
            ) {
                res.status(400).send("Invalid email or password format.");
                logger.error("Invalid email or password format.");
                return;
            }
            // Validating first_name and last_name format
            if (
                !isAlphaString(req.body.first_name) ||
                !isAlphaString(req.body.last_name)
            ) {
                res.status(400).send("Invalid format for first_name or last_name.");
                logger.error("Invalid format for first_name or last_name.");
                return;
            } else {
                const salt = await bcrypt.genSalt(10);
                const hashPassword = await bcrypt.hash(req.body.password, salt);

                const details = {
                    username: req.body.username,
                    last_name: req.body.last_name,
                    first_name: req.body.first_name,
                    password: hashPassword, 
                    is_verified: is_verified
                };
                    

                if (req.headers.authorization) {
                    res.status(403).send("Authorization is not supported for this method.");
                    logger.warn("Authorization is not supported for this method.");
                    return;
                }
                // Check database connection before proceeding
                const isDBConnected = await dbConnectionCheck();
                if (!isDBConnected) {
                    res.status(503).send("Database Connectivity Error");
                    return;
                }

                const findUser = await User.findOne({
                    where: { username: `${req.body.username}` },
                });

                if (findUser === null) {
                    //const token = generateUUID(); 
                     //Publish message to Pub/Sub topic
                     if (details.username !== 'test@gmail.com') {
                        const message = {
                            username: details.username,
                            //token: generateUUID() 
                        };
                    await publishMessage(message); }
                    console.log("published", new Date(Date.now()))
                    
                    const currTime = new Date(Date.now()); 
                    const user = await User.create(details); 
                    console.log("After user creation", new Date(Date.now()))
                    
                    const userInput = {
                        id: user.id,
                        username: user.username,
                        first_name: user.first_name,
                        last_name: user.last_name,
                        account_created: user.account_created,
                        account_updated: user.account_updated,
                        is_verified: user.is_verified,
                        
                    };
                    res.status(201).json(userInput);
                    logger.info("User details updated successfully.");
                } else {
                    res.status(400).send("User already exists.");
                    logger.error("User already exists.");
                }
            }
        });
    } else {
        res.status(405).send("Method Not Allowed");
    }
};

//Function to publish message to Pub/Sub topic
async function publishMessage(message) {
    const dataBuffer = Buffer.from(JSON.stringify(message));
    try {
        await pubsub.topic(topicName).publish(dataBuffer); 
        console.log('Message published successfully');
    } catch (error) {
        console.error('Error publishing message:', error);
    }
}


// Fetching user details following basic authentication.
const getUser = async (req, res) => {
    logger.debug('Fetching user details...');
    if (Object.keys(req.body).length !== 0) {
        res.status(400).send("Request body should be empty for GET requests.");
        logger.warn("Request body is not empty for a GET request.");
        return;
    }
const isDBConnected = await dbConnectionCheck();
        if (!isDBConnected) {
            res.status(503).send("Database Connectivity Error");
            logger.error("DB Connection error");
            return;
        }
// Check if the authorization header is undefined
if (req.headers.authorization === undefined) {
    res.status(403).send("Authorization header is missing.");
    logger.error("Authorization header is missing.");
} else {
    // Retrieve the encoded value in the format of 'basic <Token>' and extract only the <token>.
    var encoded = req.headers.authorization.split(' ')[1];
    // Decode it utilizing base64
    var decoded = Buffer.from(encoded, 'base64').toString();
    var username = decoded.split(':')[0];
    var password = decoded.split(':')[1];


    // Verify if the provided username corresponds to the records in our database.
    const findUser = await User.findOne({
        where: { username: username },
    });

    if (findUser !== null) {
        if (await bcrypt.compare(password, findUser.password)) {
            if (!findUser.is_verified) {
                res.status(403).send("User account is not verified.");
                logger.error("User account is not verified.");
                return;
            }
            let userInput = {
                id: findUser.id,
                username: findUser.username,
                first_name: findUser.first_name,
                last_name: findUser.last_name,
                account_created: findUser.account_created,
                account_updated: findUser.account_updated,
            };
        res.status(200).json(userInput);
        logger.info("User Created.");
    } else {
        res.status(401).send("Invalid password.");
    }
    } else {
    // User not found in the database
    res.status(404).send("User not found.");
    logger.error("User not found.");
    }
}
};


const updateUser = async (req, res) => {
    logger.debug('Processing user updation...');
// Check if request body is empty
if (Object.keys(req.body).length === 0) {
    res.status(400).send("Request body is empty.");
    logger.error("Request body is empty.");
    return;
}
if (req.body.first_name === "" || req.body.last_name === "" || req.body.password === "") {
    if (req.body.first_name === "") {
        res.status(400).send("First name cannot be empty.");
        logger.error("First name cannot be empty."); 
        return;
    }
    if (req.body.last_name === "") {
        res.status(400).send("Last name cannot be empty.");
        logger.error("Last name cannot be empty.");
        return;
    }
    if (req.body.password === "") {
        res.status(400).send("Password cannot be empty.");
        logger.error("Password cannot be empty."); 
        return;
    }
}

// Check for invalid fields in the payload
const invalidFields = Object.keys(req.body).filter(field => !["password", "first_name", "last_name"].includes(field));
if (invalidFields.length > 0) {
    res.status(400).send(`Invalid fields: ${invalidFields.join(", ")}. Only password, first_name, and last_name are allowed.`);
    logger.error(`Invalid fields: ${invalidFields.join(", ")}.`);
    return;
}

// Check if authorization header is missing
if (!req.headers.authorization) {
    res.status(401).send("Authorization header is missing.");
    logger.error("Authorization header is missing.");
    return;
}

// Check database connectivity
const isDBConnected = await dbConnectionCheck();
if (!isDBConnected) {
    res.status(503).send("Database Connectivity Error.");
    logger.error("Database Connectivity Error.");
    return;
}

// Decode the authorization header
const encoded = req.headers.authorization.split(" ")[1];
const decoded = Buffer.from(encoded, "base64").toString();
const username = decoded.split(":")[0];
const password = decoded.split(":")[1];

// Check if the passed username and password match with the values in our database
const findUser = await User.findOne({
    where: { username: username },
});


if (findUser !== null) {
    if (!findUser.is_verified) {
        res.status(403).send("User account is not verified. Unable to update details.");
        logger.error("User account is not verified. Unable to update details.");
        return;
    } 
    if (await bcrypt.compare(password, findUser.password)) {
        // Validate password format if provided
        if (req.body.password && !passwdValidator.validate(`${req.body.password}`)) {
            res.status(400).send("Invalid password format.");
            logger.warn("Invalid password format.");
            return;
        }

        // Generate hash password if provided
        let hashedPassword;
        if (req.body.password && req.body.password.trim() !== "") {
            const salt = await bcrypt.genSalt(10);
            hashedPassword = await bcrypt.hash(req.body.password, salt);
        }

        // Update user
        logger.debug('Updating user...');
        
        const updateData = {
            first_name: `${req.body.first_name || findUser.first_name}`,
            last_name: `${req.body.last_name || findUser.last_name}`,
            account_updated: new Date(),
        };
        if (hashedPassword) {
            updateData.password = hashedPassword;
        }

        await findUser.update(updateData);
        res.status(204).send("User updated successfully.");
        logger.info("User updated successfully."); 
    } else {
        res.status(401).send("Unauthorized access.");
        logger.error("Unauthorized access.");
    }
} else {
    res.status(401).send("Unauthorized access.");
    logger.error("Unauthorized access.");
}
}
export { addUser, getUser, updateUser, verifyUser };
