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

const logger = require('logtown')('VoidDialog');
const Dialog = require('./dialog');

/**
 * The void dialog does nothing.
 *
 * It is used for testing purposes.
 * @extends Dialog
 */
class VoidDialog extends Dialog {
  // eslint-disable-next-line require-jsdoc
  async execute(adapter, userId, messageEntities) {
    logger.debug('execute', userId, messageEntities);
    return this.done();
  }
}

module.exports = VoidDialog;
