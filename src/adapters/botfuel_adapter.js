const Messages = require('../messages');
const WebAdapter = require('./web_adapter');

const WEBCHAT_SERVER = 'https://botfuel-webchat-server.herokuapp.com';

class BotfuelAdapter extends WebAdapter {
  /**
   * Handler for webchat webhook post request
   * @param {Object} req
   * @param {Object} res
   * @returns {Promise}
   */
  async handleMessage(req, res) {
    console.log('BotfuelAdapter.handleMessage');
    const payload = req.body;
    console.log('BotfuelAdapter.handleMessage: payload', payload);
    const userId = payload.appUser._id;
    await this.bot.brain.initUserIfNecessary(userId);
    // if text message
    const message = payload.messages[0].text;
    const userMessage = Messages.getUserTextMessage(this.config.id, userId, message);
    this.bot.sendResponse(userMessage);
    res.sendStatus(200);
  }

  /**
   * Build request url for a given botMessage
   * @param {Object} botMessage
   * @returns {string}
   */
  getUrl(botMessage) {
    return `${WEBCHAT_SERVER}/bots/${this.config.id}/users/${botMessage.userId}/conversation/messages`;
  }

  /**
   * Prepare webchat post request
   * @param {Object} botMessage
   * @returns {Promise}
   */
  async sendText(botMessage) {
    console.log('BotfuelAdapter.sendText', botMessage);
    const body = {
      type: 'text',
      text: botMessage.payload,
    };
    const url = this.getUrl(botMessage);
    await this.sendResponse({ uri: url, body });
  }
}

module.exports = BotfuelAdapter;