import { Component, ViewChild } from '@angular/core'
import { AlertController, IonicPage, ModalController, NavController, NavParams, App, LoadingController, Platform } from 'ionic-angular'
import { TranslateService } from '@ngx-translate/core';
import { Wallet } from '../../providers/providers'
import { Clipboard } from '@ionic-native/clipboard'
import * as webClipboard from 'clipboard-polyfill'

@IonicPage()
@Component({
  selector: 'page-send',
  templateUrl: 'send.html'
})
export class SendPage {
  @ViewChild('address') addressEl
  @ViewChild('myAmount') myAmountEl
  public info: any
  public labelValue: string
  public messageValue: string
  public addressValue: string
  public merchantValue: string
  public memoValue: string
  public rValue: string
  public outputSum: number
  public predefinedRecipient: boolean

  public canLeave: boolean = true

  public firstClipboardContent: string
  public activeClipboardContent: string
  public currentClipboardContent: string
  public lastRawClipboardContent: string
  public resumeSub: any
  public focusEventListener: any

  public showQuickSendHint: boolean = false

  public currentWallet: string
  public allWallets: string[]

  public qrCodeURLs: string[]

  constructor(
    public alertCtrl: AlertController,
    public navCtrl: NavController,
    public navParams: NavParams,
    public appCtrl: App,
    public clipboard: Clipboard,
    public loadingCtrl: LoadingController,
    public modalCtrl: ModalController,
    public platform: Platform,
    public translate: TranslateService,
    public wallet: Wallet
  ) {
    if (!this.platform.is('cordova')) {
      this.clipboard = {
        copy: (text) => {
          return webClipboard.writeText(text)
        },
        paste: () => {
          return Promise.reject(new Error('unsupported'))
        }
      }
    }
    this.initPage(this.navParams.get('info'))
  }

  initPage(info: any) {
    this.qrCodeURLs = []
    this.currentWallet = this.wallet.getCurrentWalletName()
    this.allWallets = this.wallet.getAllWalletNames().sort()

    this.info = info
    if (typeof this.info === 'undefined') {
      this.info = {}
      this.predefinedRecipient = false
      this.labelValue = undefined
      this.messageValue = undefined
      this.addressValue = undefined
      this.merchantValue = undefined
      this.memoValue = undefined
      this.rValue = undefined
      this.outputSum = undefined
    } else {
      this.predefinedRecipient = true
      this.labelValue = this.info.label
      this.messageValue = this.info.message
      this.addressValue = this.info.outputs[0].address
      this.merchantValue = this.info.merchantName
      this.memoValue = this.info.memo
      this.rValue = this.info.r
      this.outputSum = this.info.outputs.map(o => o.satoshis).reduce((a, c) => a + c)
    }
  }

  ionViewDidLoad() {
    if (this.outputSum > 0 || this.info.isBitcoinOut) {
      this.myAmountEl.setFixedAmount(this.outputSum.toString())
    } else {
      this.myAmountEl.setFixedAmount(undefined)
    }
  }

  ionViewWillEnter() {
    if (this.platform.is('cordova')) {
      this.resumeSub = this.platform.resume.subscribe(() => {
        this.sp_handleClipboard()
      })
    } else {
      this.focusEventListener = () => {
        this.sp_handleClipboard()
      }
      window.addEventListener('focus', this.focusEventListener)
    }
    this.sp_handleClipboard()
  }

  ionViewDidEnter() {
    if (!this.addressValue || this.outputSum > 0 || this.info.isBitcoinOut) {
      return
    }
    window.setTimeout(() => {
      this.myAmountEl.setFocus()
    }, 500)
  }

  ionViewCanLeave() {
    return this.canLeave
  }

  ionViewDidLeave() {
    if (this.platform.is('cordova')) {
      this.resumeSub.unsubscribe()
    } else {
      window.removeEventListener('focus', this.focusEventListener)
    }
  }

  async setCurrentWallet() {
    if (this.currentWallet === this.wallet.getCurrentWalletName()) {
      return
    }
    this.qrCodeURLs = []
    await this.wallet.switchWallet(this.currentWallet)
  }

  async selectFromContacts() {
    await this.navCtrl.push('ContactsPage', {
      cb: (contact) => {
        this.addressEl.value = contact
      }
    })
  }

  confirmSend(satoshis: number) {
    return new Promise((resolve, reject) => {
      let ans: boolean = false
      let sendAlert = this.alertCtrl.create({
        enableBackdropDismiss: true,
        title: this.translate.instant('Q_SEND_NOW'),
        message: this.wallet.convertUnit('SATS', this.wallet.getPreferredUnit(), satoshis.toString(), true) + ' ' + this.wallet.getPreferredUnit(),
        buttons: [{
          text: this.translate.instant('CANCEL')
        },
        {
          text: this.translate.instant('OK'),
          handler: () => {
            ans = true
          }
        }]
      })
      sendAlert.onDidDismiss(() => {
        resolve(ans)
      })
      sendAlert.present()
    })
  }

  confirmDrain() {
    return new Promise((resolve, reject) => {
      let ans: boolean = false
      let drainAlert = this.alertCtrl.create({
        enableBackdropDismiss: true,
        title: this.translate.instant('Q_SEND_MAX_AMOUNT'),
        message: this.wallet.convertUnit('SATS', this.wallet.getPreferredUnit(), this.wallet.getCacheBalance().toString(), true) + ' ' + this.wallet.getPreferredUnit(),
        buttons: [{
          text: this.translate.instant('CANCEL')
        },
        {
          text: this.translate.instant('OK'),
          handler: () => {
            ans = true
          }
        }]
      })
      drainAlert.onDidDismiss(() => {
        resolve(ans)
      })
      drainAlert.present()
    })
  }

  async send() {
    this.canLeave = false
    let txComplete: boolean = await this._send()
    this.canLeave = true
    if (txComplete)  {
      this.navCtrl.popToRoot()
    }
  }

  async _send() {
    this.qrCodeURLs = []
    let outputs: any[] = this.validateSendDetails()
    if (!outputs) {
      return
    }

    // authorize
    let m: string
    if (!this.wallet.isWatchOnly()) {
      try {
        m = await this.wallet.authorize()
      } catch (err) {
        if (err.message !== 'cancelled') {
          console.log(err)
        }
        return
      }
    }

    let hasPaymail: boolean = outputs.find(output => output.paymail) ? true : false
    let paymentRefs: any[] = []
    if (hasPaymail) {
      let senderPaymail: string
      let signingKey: any
      let loader = this.loadingCtrl.create()
      await loader.present()
      if (!this.wallet.isWatchOnly() && this.wallet.getHandle()) {
        senderPaymail = this.wallet.getPaymail()
        signingKey = this.wallet.getIdentityPrivateKey(m)
      }
      try {
        let resolvedOutputs: any[] = []
        await Promise.all(outputs.filter(o => o.paymail).map(async (output) => {
          let paymentRef: any = await this.wallet.lookupPaymail(output.paymail, output.satoshis, senderPaymail, signingKey)
          if (paymentRef.reference) {
            paymentRefs.push(paymentRef)
          }
          resolvedOutputs.push(...paymentRef.outputs)
          await this.wallet.addContact(output.paymail).catch((err) => { console.log(err) })
        }))
        outputs = outputs.filter(o => !o.paymail).concat(resolvedOutputs)
        await loader.dismiss()
      } catch (err) {
        await loader.dismiss()
        this.alertCtrl.create({
          enableBackdropDismiss: false,
          title: this.translate.instant('ERROR'),
          message: this.translate.instant('ERR_UNRESOLVED_PAYMAIL'),
          buttons: [this.translate.instant('OK')]
        }).present()
        return
      }
    }

    if (this.wallet.isWatchOnly()) {
      if (paymentRefs.length > 0) {
        await this.wallet.savePaymentRefs(paymentRefs)
      }
      await this.makeUnsignedTx(outputs)
      return false
    } else {
      let txid: string = await this.signAndBroadcast(outputs, m, paymentRefs)
      if (!txid) {
        return false
      }
      let txReceived = false
      let txCallback = () => {
        txReceived = true
        let btn = window.document.querySelector('.addRemarkBtnCSSClass')
        btn && btn.removeAttribute('disabled')
      }
      this.wallet.subscribeTx(txid, txCallback)
      let message: string
      try {
        let unit: string = this.wallet.getPreferredUnit()
        let recipient: string = this.info.isBitcoinOut ? (this.labelValue || 'Script') : this.addressEl.value
        let amount: string = this.wallet.convertUnit('SATS', unit, this.myAmountEl.getSatoshis().toString(), true)
        message = `${recipient}<br>${amount} ${unit}`
      } catch (err) {
        console.log(err)
      }
      let needToggleBalance = false
      if (this.wallet.getShowBalance() === true) {
        needToggleBalance = true
        await this.wallet.toggleShowBalance()
      }
      let txCompleteAlert = this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('TX_COMPLETE'),
        message: message,
        buttons: [{
          cssClass: 'addRemarkBtnCSSClass',
          text: this.translate.instant('REMARK'),
          handler: () => {
            this.wallet.unsubscribeTx(txid, txCallback)
            needToggleBalance && this.wallet.toggleShowBalance()
            txCompleteAlert.dismiss().then(() => {
              return this.wallet.promptForTxRemark(txid)
            }).catch((err) => {
              console.log(err)
            })
            return false
          }
        }, {
          text: this.translate.instant('OK'),
          handler: () => {
            this.wallet.unsubscribeTx(txid, txCallback)
            needToggleBalance && this.wallet.toggleShowBalance()
          }
        }]
      })
      await txCompleteAlert.present()
      if (!txReceived) {
        let addRemarkBtn = window.document.querySelector('.addRemarkBtnCSSClass')
        addRemarkBtn.setAttribute('disabled', '')
      }
      return true
    }
  }

  validateSendDetails(): any[] {
    try {
      let satoshis: number = this.myAmountEl.getSatoshis()
      if (!(this.outputSum > 0 || this.info.isBitcoinOut || satoshis > 0)) { //predefined or input > 0
        throw new Error('invalid amount')
      }
      let cacheBalance: number = this.wallet.getCacheBalance()
      if (satoshis > cacheBalance || cacheBalance === 0) {
        throw new Error('not enough fund')
      }
      let outputs: any[]
      if (this.info.isBitcoinOut) {
        outputs = this.info.outputs.map(o => Object.assign({}, o))
      } else if (this.outputSum > 0) { //if amount is predefined
        outputs = this.info.outputs.map(o => Object.assign({}, o))
        outputs = outputs.filter(o => o.satoshis > 0)
      } else { //if manual input amount
        if (this.predefinedRecipient) { //if addr / script is predefined
          outputs = [Object.assign({}, this.info.outputs[0])]
          outputs[0].satoshis = satoshis
        } else {
          if (this.wallet.validatePaymail(this.addressEl.value)) {
            this.addressEl.value = this.addressEl.value.trim().toLowerCase()
          }
          outputs = [{
            address: this.addressEl.value,
            satoshis: satoshis
          }]
        }
      }
      outputs.forEach((output) => {
        if (typeof output.address !== 'undefined') {
          if (this.wallet.validatePaymail(output.address)) {
            output.paymail = output.address
          } else {
            let af: string = this.wallet.getAddressFormat(output.address)
            if (typeof af === 'undefined') {
              throw new Error('invalid address')
            }
            let legacyAddr: string = this.wallet.convertAddress(af, 'legacy', output.address)
            output.script = this.wallet.scriptFromAddress(legacyAddr)
          }
          delete output.address
        } else if (typeof output.script === 'undefined') {
          throw new Error('invalid output')
        }
      })
      return outputs
    } catch (err) {
      let errMessage: string
      if (err.message === 'invalid amount') {
        errMessage = this.translate.instant('ERR_INVALID_AMOUNT')
      } else if (err.message === 'not enough fund') {
        errMessage = this.translate.instant('ERR_NOT_ENOUGH_FUND')
      } else if (err.message === 'invalid address') {
        errMessage = this.translate.instant('ERR_INVALID_ADDR')
      } else if (err.message === 'invalid output') {
        errMessage = this.translate.instant('ERR_INVALID_OUTPUT')
      } else {
        console.log(err)
        errMessage = err.message
      }
      this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: errMessage,
        buttons: [this.translate.instant('OK')]
      }).present()
    }
  }

  async makeUnsignedTx(outputs: any[]) {
    let drain: boolean = this.myAmountEl.getSatoshis() === this.wallet.getCacheBalance()
    if (drain && !(await this.confirmDrain())) {
      return
    }
    try {
      let unsignedTx: any = await this.wallet.makeUnsignedTx(outputs.map(o => {
        return {
          script: o.script,
          satoshis: o.satoshis
        }
      }), drain)
      this.qrCodeURLs = await this.wallet.getQRs(JSON.stringify(unsignedTx), 'unsigned')
    } catch (err) {
      this.qrCodeURLs = []
      if (err.message === 'cancelled') {
        return
      }
      console.log(err)
      let errMessage = err.message
      if (err.message === 'not enough fund') {
        errMessage = this.translate.instant('ERR_NOT_ENOUGH_FUND')
      }
      await this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: errMessage,
        buttons: [this.translate.instant('OK')]
      }).present()
    }
  }

  async signAndBroadcast(outputs: any[], m: string, paymentRefs: any[]): Promise<string> {
    let drain: boolean = this.myAmountEl.getSatoshis() === this.wallet.getCacheBalance()

    if (drain && !(await this.confirmDrain())) {
      return
    }

    if (!drain && this.wallet.getPreferredProtection() === 'OFF' &&  !(await this.confirmSend(outputs.map(o => o.satoshis).reduce((a, c) => a + c)))) {
      return
    }

    let loader = this.loadingCtrl.create({
      content: this.translate.instant('SIGNING')+'...'
    })
    await loader.present()

    //sign
    let hex: string
    try {
      let signedTx: any = await this.wallet.makeSignedTx(outputs.map(o => {
        return {
          script: o.script,
          satoshis: o.satoshis
        }
      }), drain, m)
      hex = signedTx.hex
    } catch (err) {
      await loader.dismiss()
      if (err.message === 'cancelled') {
        return
      }
      console.log(err)
      let errMessage = err.message
      if (err.message === 'not enough fund') {
        errMessage = this.translate.instant('ERR_NOT_ENOUGH_FUND')
      }
      await this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: errMessage,
        buttons: [this.translate.instant('OK')]
      }).present()
      return
    }

    let txid: string = this.wallet.getTxidFromHex(hex)
    let txComplete: boolean = false
    if (this.info.bip70) {
      txComplete = await this.sendBIP70(hex, loader)
    } else {
      let metadata: any
      if (paymentRefs.length > 0 && this.wallet.getHandle()) {
        metadata = {
          sender: this.wallet.getPaymail(),
          pubkey: this.wallet.getIdentityPublicKey().toString(),
          signature: this.wallet.signMessage(txid, this.wallet.getIdentityPrivateKey(m))
        }
      }
      txComplete = await this.wallet.broadcastTx(hex, loader, paymentRefs, metadata)
    }

    if (txComplete) {
      await this.clipboard.copy('').catch((err: any) => {

      })
    }

    return txComplete ? txid : undefined

  }

  async sendBIP70(hex: string, loader: any) {
    try {
      if (this.info.expires > 0 && new Date().getTime() > this.info.expires * 1000) {
        throw new Error('expired')
      }
      loader.setContent(this.translate.instant('SENDING')+'...')
      let memo: string = await this.wallet.sendPaymentToMerchant(
        this.info.paymentUrl,
        hex,
        this.wallet.getCacheChangeAddress(),
        this.info.merchantData
      )
      await loader.dismiss()
      let successAlert = this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('TX_COMPLETE'),
        message: memo,
        buttons: [this.translate.instant('OK')]
      })
      await successAlert.present()
      return true
    } catch (err) {
      await loader.dismiss()
      console.log(err)
      let message: string
      if (err.message == 'expired') {
        message = this.translate.instant('ERR_EXPIRED')
      } else if (err.status === 400) {
        message = this.translate.instant('ERR_REJECTED')
      } else {
        message = this.translate.instant('ERR_SEND_FAILED')
      }
      await this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: message,
        buttons: [this.translate.instant('OK')]
      }).present()
      return false
    }
  }

  sp_handlePaste(ev: any) {
    let text: string = ev.clipboardData.getData('text')
    if (!this.wallet.validatePaymail(text) && typeof this.wallet.getAddressFormat(text) === 'undefined') {
      this.sp_handleURL(text)
    }
  }

  sp_handleClipboard() {
    if (!this.canLeave) {
      return
    }
    this.clipboard.paste().then((content: string) => {
      this.canLeave = false
      if (typeof this.firstClipboardContent === 'undefined') {
        this.firstClipboardContent = content
      }
      if (this.lastRawClipboardContent === content) {
        return
      }
      this.lastRawClipboardContent = content
      let isPaymail: boolean = this.wallet.validatePaymail(content)
      let af: string = this.wallet.getAddressFormat(content)
      if (!content || !isPaymail && !af && !this.wallet.getRequestFromURL(content)) {
        this.currentClipboardContent = ''
        return
      }
      this.currentClipboardContent = content
      if (
        (typeof this.activeClipboardContent === 'undefined' && this.currentClipboardContent !== this.firstClipboardContent) ||
        (typeof this.activeClipboardContent !== 'undefined' && this.currentClipboardContent !== this.activeClipboardContent)
      ) {
        this.showQuickSendHint = true
        this.activeClipboardContent = this.currentClipboardContent
        this.initPage(undefined)
        this.ionViewDidLoad()
        let url: string
        if (isPaymail) {
          url = 'payto:' + this.activeClipboardContent.trim().toLowerCase()
        } else if (af === 'legacy') {
          url = 'bitcoin:' + this.activeClipboardContent + '?sv'
        } else if (af === 'cashaddr' && !this.activeClipboardContent.match(/^bitcoincash:/gi)) {
          url = 'bitcoincash:' + this.activeClipboardContent
        } else {
          url = this.activeClipboardContent
        }
        return this.sp_handleURL(url)
      }
    }).catch((err: any) => {

    }).then((r: boolean) => {
      this.canLeave = true
    })
  }

  async sp_handleURL(url: string) {
    let info: any = this.wallet.getRequestFromURL(url)
    if (typeof info === 'undefined') {
      return false
    }
    if (typeof info.url !== 'undefined') {
      info = await this.sp_handleBIP70(info.url)
      if (typeof info === 'undefined') {
        return false
      }
    }
    if (info.outputs.length === 0) {
      return false
    }
    this.initPage(info)
    this.ionViewDidLoad()
    this.ionViewDidEnter()
    return true
  }

  async sp_handleBIP70(url: string) {
    let loader = this.loadingCtrl.create({
      content: this.translate.instant('LOADING')+'...'
    })
    await loader.present()
    let request: any
    let errMessage: string
    try {
      request = await this.wallet.getRequestFromMerchant(url)
    } catch (err) {
      console.log(err)
      if (err.message === 'unsupported network') {
        errMessage = this.translate.instant('ERR_UNSUPPORTED_NETWORK')
      } else if (err.message === 'expired') {
        errMessage = this.translate.instant('ERR_EXPIRED')
      } else {
        errMessage = this.translate.instant('ERR_GET_REQUEST_FAIlED')
      }
    }
    await loader.dismiss()
    if (typeof errMessage === 'undefined') {
      return request
    } else {
      this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: errMessage,
        buttons: [this.translate.instant('OK')]
      }).present()
    }
  }

  dummyFunction() {

  }

}
