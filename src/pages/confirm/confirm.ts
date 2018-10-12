import { Component } from '@angular/core'
import { AlertController, IonicPage, LoadingController, NavController, NavParams, ViewController } from 'ionic-angular'
import { TranslateService } from '@ngx-translate/core';
import { Wallet } from '../../providers/providers'

@IonicPage()
@Component({
  selector: 'page-confirm',
  templateUrl: 'confirm.html'
})
export class ConfirmPage {

  private unit: string = this.wallet.getPreferredUnit()
  private info: any
  private qrCodeURL: string
  private confirmBtnText: string
  private isReady: boolean = false
  private timestamp: number
  private priceCallback: Function

  constructor(
    public alertCtrl: AlertController,
    public loadingCtrl: LoadingController,
    public navCtrl: NavController,
    private navParams: NavParams,
    public viewCtrl: ViewController,
    private translate: TranslateService,
    private wallet: Wallet
  ) {
    this.info = navParams.get('info')
    if (this.info.bip70) {
      this.confirmBtnText = 'SEND'
    } else {
      this.confirmBtnText = 'BROADCAST'
    }
    this.isReady = true
    this.priceCallback = () => {
      this.timestamp = new Date().getTime()
    }
  }

  ionViewCanLeave() {
    return this.isReady
  }

  ionViewWillEnter() {
    this.wallet.subscribePrice(this.priceCallback)
  }

  ionViewDidLeave() {
    this.wallet.unsubscribePrice(this.priceCallback)
  }

  changeUnit() {
    this.unit = this.wallet.changePreferredUnit()
  }

  async confirm(ev: any) {
    this.isReady = false
    try {
      if (!this.info.sweep) {
        await this.wallet.authorize()
      }
      if (this.info.bip70) {
        await this.sendBIP70()
      } else {
        await this.broadcast()
      }
    } catch (err) {
      if (err.message !== 'cancelled') {
        console.log(err)
      }
    }
    this.isReady = true
  }

  async sendBIP70() {
    let loader = this.loadingCtrl.create({
      content: this.translate.instant('SENDING')+"..."
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
      console.log(err)
      await loader.dismiss()
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

  async broadcast() {
    let loader = this.loadingCtrl.create({
      content: this.translate.instant('BROADCASTING')+"..."
    })
    try {
      await loader.present()
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
      console.log(err)
      await loader.dismiss()
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
}
