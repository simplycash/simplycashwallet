import { Component } from '@angular/core'
import { AlertController, IonicPage, LoadingController, NavController, NavParams, ViewController } from 'ionic-angular'

import { Wallet } from '../../providers/providers'

@IonicPage()
@Component({
  selector: 'page-confirm',
  templateUrl: 'confirm.html'
})
export class ConfirmPage {

  private unit: string = this.wallet.getUnits()[0]
  private info: any
  private qrCodeURL: string
  private isReady: boolean = false

  constructor(
    public alertCtrl: AlertController,
    public loadingCtrl: LoadingController,
    public navCtrl: NavController,
    private navParams: NavParams,
    public viewCtrl: ViewController,
    private wallet: Wallet
  ) {
    this.info = navParams.get('info')
    this.isReady = true
  }

  ionViewCanLeave() {
    return this.isReady
  }

  changeUnit() {
    let units = this.wallet.getUnits()
    this.unit = units[(units.indexOf(this.unit)+1)%units.length]
  }

  async sendBIP70(ev: any) {
    this.isReady = false
    let loader = this.loadingCtrl.create({
      content: "sending..."
    })
    try {
      if (this.info.expires > 0 && new Date().getTime() > this.info.expires * 1000) {
        throw new Error('expired')
      }
      await loader.present()
      let memo: string = await this.wallet.sendPaymentToMerchant(
        this.info.paymentUrl,
        this.info.hex,
        this.wallet.getCacheChangeAddress(),
        this.info.merchantData
      )
      await loader.dismiss()
      let successAlert = this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: 'Success',
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
      successAlert.present()
    } catch (err) {
      console.log(err)
      await loader.dismiss()
      let message: string
      if (err.message == 'expired') {
        message = err.message
      } else if (err.status === 400) {
        message = 'rejected'
      } else {
        message = 'failed to send'
      }
      this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: 'Error',
        message: message,
        buttons: ['ok']
      }).present()
    }
    this.isReady = true
  }

  async broadcast(ev: any) {
    this.isReady = false
    let loader = this.loadingCtrl.create({
      content: "broadcasting..."
    })
    try {
      await loader.present()
      let txid: string = await this.wallet.broadcastTx(this.info.hex)
      await loader.dismiss()
      let successAlert = this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: 'Success',
        message: 'transaction complete',
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
      successAlert.present()
    } catch (err) {
      console.log(err)
      await loader.dismiss()
      let message: string
      if (err.message == 'not connected') {
        message = 'not connected to server'
      } else if (err.message == 'timeout') {
        message = 'timeout'
      } else {
        message = 'invalid transaction'
      }
      this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: 'Error',
        message: message,
        buttons: ['ok']
      }).present()
    }
    this.isReady = true
  }
}
