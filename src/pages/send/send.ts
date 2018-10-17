import { Component, ViewChild } from '@angular/core'
import { AlertController, IonicPage, ModalController, NavController, NavParams, App, LoadingController, ToastController } from 'ionic-angular'
import { TranslateService } from '@ngx-translate/core';
import { Wallet } from '../../providers/providers'

@IonicPage()
@Component({
  selector: 'page-send',
  templateUrl: 'send.html'
})
export class SendPage {
  @ViewChild('address') addressEl
  @ViewChild('myAmount') myAmountEl
  private info: any
  private labelValue: string
  private messageValue: string
  private addressValue: string
  private merchantValue: string
  private memoValue: string
  private rValue: string
  private outputSum: number
  private canLeave: boolean = true
  private predefinedRecipient: boolean

  constructor(
    public alertCtrl: AlertController,
    public navCtrl: NavController,
    private navParams: NavParams,
    public appCtrl: App,
    public loadingCtrl: LoadingController,
    public modalCtrl: ModalController,
    private translate: TranslateService,
    private wallet: Wallet
  ) {
    this.info = this.navParams.get('info')
    if (typeof this.info === 'undefined') {
      this.predefinedRecipient = false
      this.info = {}
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

  ionViewDidEnter() {
    if (!this.addressValue || this.outputSum > 0) {
      return
    }
    window.setTimeout(() => {
      this.myAmountEl.setFocus()
    }, 500)
  }

  ionViewCanLeave() {
    return this.canLeave
  }

  confirmSend() {
    return new Promise((resolve, reject) => {
      let ans: boolean = false
      let sendAlert = this.alertCtrl.create({
        enableBackdropDismiss: true,
        title: this.translate.instant('Q_SEND_NOW'),
        buttons: [{
          text: this.translate.instant('CANCEL')
        },
        {
          text: 'ok',
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
        buttons: [{
          text: this.translate.instant('CANCEL')
        },
        {
          text: 'ok',
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
    await this.signAndBroadcast()
    this.canLeave = true
  }

  async signAndBroadcast() {
    let drain: boolean = false
    // validate
    try {
      let satoshis: number = this.myAmountEl.getSatoshis() //undefined -> drain
      if (!(this.outputSum > 0) && satoshis <= 0) { //if manual input amount <= 0
          throw new Error('invalid amount')
      }
      if (satoshis > this.wallet.getCacheBalance()) {
        throw new Error('not enough fund')
      }
      if (this.outputSum > 0) { //if amount is predefined
        this.info.outputs = this.info.outputs.filter(o => o.satoshis > 0)
      } else { //if manual input amount
        if (this.predefinedRecipient) { //if addr / script is predefined
          this.info.outputs = this.info.outputs.slice(0, 1)
          this.info.outputs[0].satoshis = satoshis
        } else {
          this.info.outputs = [{
            address: this.addressEl.value,
            satoshis: satoshis
          }]
        }
        if (typeof satoshis === 'undefined') {
          drain = true
        }
      }
      this.info.outputs.forEach((output) => {
        if (typeof output.address !== 'undefined') {
          let af: string = this.wallet.getAddressFormat(output.address)
          if (typeof af === 'undefined') {
            throw new Error('invalid address')
          }
          let legacyAddr: string = this.wallet.convertAddress(af, 'legacy', output.address)
          output.script = this.wallet.scriptFromAddress(legacyAddr)
        } else if (typeof output.script === 'undefined') {
          throw new Error('invalid output')
        }
      })
    } catch (err) {
      console.log(err)
      let errMessage = err.message
      if (err.message === 'invalid amount') {
        errMessage = this.translate.instant('ERR_INVALID_AMOUNT')
      } else if (err.message === 'not enough fund') {
        errMessage = this.translate.instant('ERR_NOT_ENOUGH_FUND')
      } else if (err.message === 'invalid address') {
        errMessage = this.translate.instant('ERR_INVALID_ADDR')
      } else if (err.message === 'invalid output') {
        errMessage = this.translate.instant('ERR_INVALID_OUTPUT')
      }
      this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: errMessage,
        buttons: ['ok']
      }).present()
      return
    }

    if (drain && !(await this.confirmDrain())) {
      return
    }

    if (!drain && this.wallet.getPreferredProtection() === 'OFF' &&  !(await this.confirmSend())) {
      return
    }

    // authorize
    try {
      await this.wallet.authorize()
    } catch (err) {
      if (err.message !== 'cancelled') {
        console.log(err)
      }
      return
    }

    let loader = this.loadingCtrl.create({
      content: this.translate.instant('SIGNING')+'...'
    })
    await loader.present()

    //sign
    try {
      let signedTx: { satoshis: number, hex: string, fee: number } = await this.wallet.makeSignedTx(this.info.outputs, drain)
      Object.assign(this.info, signedTx)
    } catch (err) {
      console.log(err)
      let errMessage = err.message
      if (err.message === 'not enough fund') {
        errMessage = this.translate.instant('ERR_NOT_ENOUGH_FUND')
      }
      await loader.dismiss()
      await this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: errMessage,
        buttons: ['ok']
      }).present()
      return
    }

    if (this.info.bip70) {
      await this.sendBIP70(loader)
    } else {
      await this.broadcast(loader)
    }

  }

  async sendBIP70(loader: any) {
    try {
      if (this.info.expires > 0 && new Date().getTime() > this.info.expires * 1000) {
        throw new Error('expired')
      }
      loader.setContent(this.translate.instant('SENDING')+'...')
      let memo: string = await this.wallet.sendPaymentToMerchant(
        this.info.paymentUrl,
        this.info.hex,
        this.wallet.getCacheChangeAddress(),
        this.info.merchantData
      )
      await loader.dismiss()
      let successAlert = this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('TX_COMPLETE'),
        message: memo,
        buttons: [{
          text: 'ok',
          handler: () => {
            successAlert.dismiss().then(() => {
              this.navCtrl.popToRoot()
            })
            return false
          }
        }]
      })
      await successAlert.present()
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
        buttons: ['ok']
      }).present()
    }
  }

  async broadcast(loader: any) {
    try {
      loader.setContent(this.translate.instant('BROADCASTING')+'...')
      let txid: string = await this.wallet.broadcastTx(this.info.hex)
      await loader.dismiss()
      let successAlert = this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('TX_COMPLETE'),
        buttons: [{
          text: 'ok',
          handler: () => {
            successAlert.dismiss().then(() => {
              this.navCtrl.popToRoot()
            })
            return false
          }
        }]
      })
      await successAlert.present()
    } catch (err) {
      await loader.dismiss()
      console.log(err)
      let message: string
      if (err.message == 'not connected') {
        message = this.translate.instant('ERR_NOT_CONNECTED')
      } else if (err.message == 'timeout') {
        message = this.translate.instant('ERR_TIMEOUT')
      } else {
        message = this.translate.instant('ERR_INVALID_TX')
      }
      await this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: message,
        buttons: ['ok']
      }).present()
    }
  }

  resetForm() {
    this.addressEl.value = ''
    this.myAmountEl.clear()
  }

}
