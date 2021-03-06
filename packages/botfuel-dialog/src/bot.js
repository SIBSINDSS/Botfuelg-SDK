/**
 * Copyright (c) 2017 - present, Botfuel (https://www.botfuel.io).
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const Logger = require('logtown');
const AdapterResolver = require('./adapter-resolver');
const BrainResolver = require('./brain-resolver');
const NluResolver = require('./nlu-resolver');
const DialogManager = require('./dialog-manager');
const { getConfiguration } = require('./config');
const AuthenticationError = require('./errors/authentication-error');
const DialogError = require('./errors/dialog-error');
const ResolutionError = require('./errors/resolution-error');
const { checkCredentials } = require('./utils/environment');
const MiddlewareManager = require('./middleware-manager');
const measureTime = require('./utils/measure');

const logger = Logger.getLogger('Bot');
const measure = measureTime(logger);

/**
 * This is the bot main class that ties all the components together.
 *
 * A bot has :
 * - an {@link Adapter},
 * - a {@link Brain},
 * - a {@link Config},
 * - a {@link DialogManager},
 * - a {@link MiddlewareManager},
 * - a {@link Nlu} (Natural Language Understanding) module.
 */
class Bot {
  constructor(config) {
    logger.debug('constructor', { config });
    this.config = getConfiguration(config);
    logger.debug('constructor', { config: this.config });
    checkCredentials(this.config);
    this.brain = new BrainResolver(this).resolve(this.config.brain.name);
    this.nlu = new NluResolver(this).resolve(this.config.nlu.name);
    this.dm = new DialogManager(this);
    this.adapter = new AdapterResolver(this).resolve(this.config.adapter.name);
    this.middlewareManager = new MiddlewareManager(this);
  }

  /**
   * Initializes the bot.
   * @private
   */
  async init() {
    logger.debug('init');
    await this.brain.init();
    await this.nlu.init();
  }

  /**
   * Runs the bot.
   */
  async run() {
    logger.debug('run');
    await this.init();
    await this.adapter.run();
  }

  /**
   * Plays user messages (only available with the TestAdapter).
   */
  async play(userMessages) {
    logger.debug('play', { userMessages });
    await this.init();
    await this.adapter.play(userMessages);
  }

  /**
   * Cleans the bot brain.
   */
  async clean() {
    logger.debug('clean');
    await this.brain.init();
    await this.brain.clean();
  }

  async handleMessage(userMessage) {
    return measure('handleMessage')(() => this._handleMessage(userMessage));
  }

  /**
   * Handles a user message.
   */
  async _handleMessage(userMessage) {
    logger.debug('handleMessage', { userMessage });
    try {
      const contextIn = {
        user: userMessage.user,
        brain: this.brain,
        userMessage,
        config: this.config,
      };
      let botMessages = [];
      await this.middlewareManager.in(contextIn, async () => {
        logger.debug('handleMessage: responding');
        botMessages = await this.respond(userMessage);
      });
      const contextOut = {
        user: userMessage.user,
        brain: this.brain,
        botMessages,
        config: this.config,
        userMessage,
      };
      await this.middlewareManager.out(contextOut, async () => {});
      return botMessages;
    } catch (error) {
      logger.debug('handleMessage: catching', { error });
      return this.respondWhenError(userMessage, error);
    }
  }

  /**
   * Responds to the user.
   */
  async respond(userMessage) {
    logger.debug('respond', { userMessage });
    switch (userMessage.type) {
      case 'postback':
        return this.respondWhenPostback(userMessage);
      case 'image':
        return this.respondWhenImage(userMessage);
      case 'file':
        return this.respondWhenFile(userMessage);
      case 'text':
      default:
        return this.respondWhenText(userMessage);
    }
  }

  /**
   * Computes the responses for a user message of type text.
   * @private
   */
  async respondWhenText(userMessage) {
    logger.debug('respondWhenText', { userMessage });
    // If text input is too long then trigger the complex-input dialog
    if (userMessage.payload.value.length > 256) {
      logger.error('respondWhenText: input is too long.');
      const complexInputDialog = {
        name: 'complex-input',
        data: {},
        triggeredBy: 'dialog-manager',
      };
      return this.dm.executeDialog(userMessage, complexInputDialog);
    }
    const { classificationResults, messageEntities } = await measure('nlu compute')(() => this.nlu.compute(
      userMessage.payload.value,
      { brain: this.brain, userMessage },
    ));
    logger.debug('respondWhenText: classificationResults', classificationResults, messageEntities);
    return this.dm.executeClassificationResults(
      userMessage,
      classificationResults,
      messageEntities,
    );
  }

  /**
   * Computes the responses for a user message of type postback.
   * @private
   */
  async respondWhenPostback(userMessage) {
    logger.debug('respondWhenPostback', { userMessage });
    const dialog = {
      name: userMessage.payload.value.name,
      data: userMessage.payload.value.data,
      triggeredBy: 'postback',
    };
    return this.dm.executeDialog(userMessage, dialog);
  }

  /**
   * Computes the responses for a user message of type image.
   * @private
   */
  async respondWhenImage(userMessage) {
    logger.debug('respondWhenImage', { userMessage });
    const dialog = {
      name: 'image',
      data: {
        url: userMessage.payload.value,
      },
      triggeredBy: 'dialog-manager',
    };
    return this.dm.executeDialog(userMessage, dialog);
  }

  /**
   * Computes the responses for a user message of type file.
   * @private
   */
  async respondWhenFile(userMessage) {
    logger.debug('respondWhenFile', { userMessage });
    const dialog = {
      name: 'file',
      data: {
        url: userMessage.payload.value,
      },
      triggeredBy: 'dialog-manager',
    };
    return this.dm.executeDialog(userMessage, dialog);
  }

  async respondWhenError(userMessage, error) {
    logger.debug('respondWhenError', { userMessage, error });
    if (error instanceof AuthenticationError) {
      logger.error('Botfuel API authentication failed!');
      logger.error(
        'Please check your app???s credentials and that its plan limits haven???t been reached on https://api.botfuel.io',
      );
    } else if (error instanceof ResolutionError) {
      logger.error(`Could not resolve '${error.name}'`);
    } else if (error instanceof DialogError) {
      logger.error(`Could not execute dialog '${error.name}'`);
    }
    const keys = Object.getOwnPropertyNames(error);
    // error is not a standard JS Object so we have to copy each property
    // one by one
    const errorObject = keys.reduce(
      (obj, key) => ({
        ...obj,
        [key]: error[key],
      }),
      {},
    );
    const catchDialog = {
      name: 'catch',
      data: {
        error: errorObject,
      },
      triggeredBy: 'dialog-manager',
    };
    return this.dm.executeDialog(userMessage, catchDialog);
  }
}

module.exports = Bot;
