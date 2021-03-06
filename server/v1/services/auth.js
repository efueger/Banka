import bcrypt from 'bcryptjs';
import randomString from 'randomstring';
import dbConnection from '../config/database';
import UserModel from '../model/users';
import registrationHelper from '../helper/registrationHelper';
import sendEmail from '../config/mailer';


const secretToken = randomString.generate();

const AuthService = {
  /**
   * Login user
   * @constructor
   * @param {*} userData - user form data.
   * @param {*} token - user's token
   */
  async loginUser(userData, token) {
    /* eslint max-len: ["error", { "ignoreRegExpLiterals": true }] */
    const emailRegex = /^([a-zA-Z0-9_\-\.]+)@([a-zA-Z0-9_\-\.]+)\.([a-zA-Z]{2,10})$/;
    const passwordRegex = /^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[#?!@$%^&*-]).{8,}$/;
    let returnStatus; let returnSuccess = ''; let returnError = '';

    // Check if email and password is valid
    if (emailRegex.test(userData.email)
      && passwordRegex.test(userData.password)) {
      // check if email, if it exist get the user data
      const emailresponse = await dbConnection
        .dbConnect('SELECT * FROM users WHERE email=$1', [userData.email]);
      if (emailresponse.rows.length > 0) {
        // Load hash from your password DB.
        const passwordUnhash = bcrypt
          .compareSync(userData.password, emailresponse.rows[0].password);
        if (passwordUnhash) {
          // if user is verified
          if (emailresponse.rows[0].verify) {
            // return users details
            const user = new UserModel();
            user.id = emailresponse.rows[0].id;
            user.firstName = emailresponse.rows[0].firstname;
            user.lastName = emailresponse.rows[0].lastname;
            user.email = emailresponse.rows[0].email;
            user.token = token;
            user.secretToken = emailresponse.rows[0].secrettoken;
            user.avatar = emailresponse.rows[0].avatar;
            returnStatus = 201;
            returnSuccess = user;
          } else {
            returnStatus = 401;
            returnError = 'Your account is not verified';
          }
        } else {
          // else echo incorrect password
          returnStatus = 422;
          returnError = 'incorrect password';
        }
      } else {
        returnStatus = 404;
        returnError = 'email does not exist';
      }
    } else {
      const error = [];
      if (!emailRegex.test(userData.email)) {
        returnStatus = 422;
        error.push('invalid email address');
      }

      if (!passwordRegex.test(userData.password)) {
        returnStatus = 422;
        error
          .push('Password should contain atleast 8 characters, 1 uppercase letter, 1 lowercase letter, 1 number and 1 symbol or character');
      }
      returnError = error;
    }


    return {
      returnStatus,
      returnSuccess,
      returnError,
    };
  },

  /**
   * Verify user
   * @constructor
   * @param {*} verifyToken - secret token.
   */
  async verifyUser(verifyToken) {
    const whiteSpaces = /\s/g;
    let returnStatus; let returnSuccess = ''; let returnError = '';

    const vToken = verifyToken.replace(whiteSpaces, '');
    const verifyUser = await dbConnection
      .dbConnect('SELECT verify, firstname, lastname, email FROM users WHERE secretToken=$1',
        [vToken]);

    if (verifyUser.rows.length >= 1 && vToken !== '') {
      const updateUser = await dbConnection
        .dbConnect('UPDATE users SET verify=$1, secretToken=$2 WHERE secretToken=$3',
          [true, '', vToken]);
      if (updateUser.command === 'UPDATE') {
        const html = `<div style='width:100%;text-align:center;'>
              <div style='color:#2196F3;background-color:#2196F3;color:#ffffff;padding:2rem 0;'>
                <h2>Welcome to Banka</h2>
                <h2>${verifyUser.rows[0].lastname} ${verifyUser.rows[0].firstname}</h2>
              </div>
              <br />
              We are happy to have you as part of the family.
              <br /><br />
              Please if you have any issues, do contact our customer care services
              <br /><br />
              Thank You.
            </div>
            `;

        await sendEmail
          .sendEmail('do_not_reply@banka.com',
            verifyUser.rows[0].email, 'Welcome to Banka', html);
        returnStatus = 200;
        returnSuccess = 'user successfully verified';
      }
    } else {
      returnStatus = 422;
      returnError = 'invalid secret token';
    }

    return {
      returnStatus,
      returnSuccess,
      returnError,
    };
  },

  /**
   * Send Reset
   * @constructor
   * @param {*} userEmail - user email.
   */
  async sendReset(userEmail) {
    /* eslint max-len: ["error", { "ignoreRegExpLiterals": true }] */
    const emailRegex = /^([a-zA-Z0-9_\-\.]+)@([a-zA-Z0-9_\-\.]+)\.([a-zA-Z]{2,10})$/;
    let returnStatus; let returnSuccess = ''; let returnError = '';

    if (emailRegex.test(userEmail.email)) {
      const user = await dbConnection
        .dbConnect('SELECT lastname, email FROM users WHERE email=$1',
          [userEmail.email]);

      if (user.rows.length > 0) {
        const updateUser = await dbConnection
          .dbConnect('UPDATE users SET secretToken=$1 WHERE email=$2',
            [secretToken, userEmail.email]);
        if (updateUser.command === 'UPDATE') {
          const html = `Hi ${user.rows[0].lastname},
              <br /><br />
              You requested for a password reset, below is the link to reset your password
              <br /><br />
              <a style='text-decoration:none;background-color:#2196F3;color:#ffffff;padding:1rem 1.5rem;' href="https://cavdy.github.io/Banka/forgot.html?reset=${secretToken}">Reset</a>
              <br /><br />
              If you can not click on the button above, copy this link <strong>https://cavdy.github.io/Banka/forgot.html?reset=${secretToken}</strong>
              <br /><br />
              Please ignore if you didn't request for password reset.
              <br /><br />
              Thank You.
            `;

          await sendEmail
            .sendEmail('do_not_reply@banka.com',
              userEmail.email, 'Reset your password', html);
          returnStatus = 201;
          returnSuccess = 'reset password has been sent to your mail';
        }
      } else {
        returnStatus = 404;
        returnError = 'account not found';
      }
    } else {
      returnStatus = 422;
      returnError = 'invalid email address';
    }

    return {
      returnStatus,
      returnSuccess,
      returnError,
    };
  },

  /**
   * Forgot password
   * @constructor
   * @param {*} verifyToken - secret token.
   * @param {*} newPassword - user new password.
   */
  async forgotPassword(verifyToken, newPassword) {
    const whiteSpaces = /\s/g;
    let returnStatus; let returnSuccess = ''; let returnError = '';

    const vToken = verifyToken.replace(whiteSpaces, '');

    const verifyUser = await dbConnection
      .dbConnect('SELECT lastname, email FROM users WHERE secretToken=$1',
        [vToken]);

    if (verifyUser.rows.length > 0 && vToken !== '') {
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(newPassword.password, salt);
      const updateUser = await dbConnection
        .dbConnect('UPDATE users SET password=$1, secretToken=$2 WHERE secretToken=$3',
          [hash, '', vToken]);
      if (updateUser.command === 'UPDATE') {
        const html = `Hi ${verifyUser.rows[0].lastname},
        <br /><br />
        Your password has successfully been reset
        <br /><br />
        You can now log in with your new password
        <br /><br />
        Thank You.
      `;

        await sendEmail
          .sendEmail('do_not_reply@banka.com',
            verifyUser.rows[0].email, 'Password reset successful', html);

        returnStatus = 200;
        returnSuccess = 'password reset successful';
      }
    } else {
      returnStatus = 422;
      returnError = 'invalid secret token';
    }

    return {
      returnStatus,
      returnSuccess,
      returnError,
    };
  },

  /**
   * Register user
   * @constructor
   * @param {*} userData - user form data.
   * @param {*} avatar - profile image.
   */
  async registerUser(userData, avatar) {
    const returnData = await registrationHelper.registrationHelper(userData);
    let returnStatus; let returnSuccess = ''; let returnError = '';
    const whiteSpaces = /\s/g;

    let email;
    let fname;
    let lname;
    let password;
    let mAvatar;

    // strip spaces
    if (typeof userData.email !== 'undefined') {
      email = userData.email.replace(whiteSpaces, '');
      email = userData.email.trim();
    }

    if (typeof userData.firstName !== 'undefined') {
      fname = userData.firstName.replace(whiteSpaces, '');
      fname = userData.firstName.trim();
    }

    if (typeof userData.lastName !== 'undefined') {
      lname = userData.lastName.replace(whiteSpaces, '');
      lname = userData.lastName.trim();
    }

    if (typeof userData.password !== 'undefined') {
      password = userData.password.replace(whiteSpaces, '');
      password = userData.password.trim();
    }

    // check if avatar is undefined
    if (typeof avatar !== 'undefined') {
      mAvatar = avatar.path;
    } else {
      mAvatar = '';
    }

    if (returnData[0] === true
      && returnData[1] === true
      && returnData[2] === true
      && returnData[3] === true) {
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(password, salt);
      userData.type = 'client';
      userData.isAdmin = false;
      // checks if email exist
      const emailresponse = await dbConnection
        .dbConnect('SELECT email FROM users WHERE email=$1',
          [email]);
      if (emailresponse.rows.length >= 1) {
        returnStatus = 409;
        returnError = 'email already exist';
      } else {
        // email does not exist... you can insert data
        const response = await dbConnection
          .dbConnect('INSERT into users(email, firstName, lastName, password, type, isAdmin, verify, secretToken, avatar) values($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING email, firstname, lastname',
            [email, fname, lname, hash, userData.type, userData.isAdmin, 'false', secretToken, mAvatar]);
        if (response.command === 'INSERT') {
          const html = `Hi ${response.rows[0].lastname},
            <br /><br />
            Thank you for registering with us, below is your verification key
            <br /><br />
            <a style='text-decoration:none;background-color:#2196F3;color:#ffffff;padding:1rem 1.5rem;' href="https://cavdy.github.io/Banka/login.html?secret=${secretToken}">Verify</a>
            <br /><br />
            If you can not click on the button above, copy this link <strong>https://cavdy.github.io/Banka/login.html?secret=${secretToken}</strong>
            <br /><br />
            Please we will never ask you for this verification key, do not share it with anyone.
            <br /><br />
            Thank You.
          `;

          await sendEmail
            .sendEmail('do_not_reply@banka.com',
              response.rows[0].email, 'Verify your email', html);
          returnStatus = 201;
          returnSuccess = 'Successfully signed up, check your email for verification';
        }
      }
    } else {
      returnStatus = 422;
      // eslint-disable-next-line prefer-destructuring
      returnError = returnData[4];
    }
    return {
      returnStatus,
      returnSuccess,
      returnError,
    };
  },
};

export default AuthService;
