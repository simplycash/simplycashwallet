import { Component, ViewChild } from '@angular/core';
import { AlertController, IonicPage, LoadingController, NavController, NavParams } from 'ionic-angular';
import { TranslateService } from '@ngx-translate/core';
import { Wallet } from '../../providers/providers'

/**
 * Generated class for the SweepPage page.
 *
 * See https://ionicframework.com/docs/components/#navigation for more info on
 * Ionic pages and navigation.
 */

@IonicPage()
@Component({
  selector: 'page-sweep',
  templateUrl: 'sweep.html',
})
export class SweepPage {
  @ViewChild('myAmount') myAmountEl
  private wif: string
  private wifInfo: { address: string, balance: number, utxos: any[] }
  private address: string
  private balance: number
  private canLeave: boolean = true

  constructor(
    public alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    public navCtrl: NavController,
    public navParams: NavParams,
    private translate: TranslateService,
    private wallet: Wallet
  ) {
  }

  ionViewCanLeave() {
    return this.canLeave
  }

  async ionViewDidEnter() {
    let loader = this.loadingCtrl.create({
      content: this.translate.instant('LOADING_BALANCE')+'...'
    })
    await loader.present()
    try {
      this.wif = this.navParams.get('wif')
      let info: any = await this.wallet.getInfoFromWIF(this.wif)
      this.wifInfo = info
      this.address = info.address
      this.balance = info.balance
      this.myAmountEl.setFixedAmount(this.balance.toString())
      await loader.dismiss()
    } catch (err) {
      console.log(err)
      let message: string
      if (err.message == 'not connected') {
        message = this.translate.instant('ERR_GET_ADDR_BALANCE_FAILED')
      } else {
        message = this.translate.instant('ERR_LOAD_WIF_FAILED')
      }
      let errorAlert = this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: message,
        buttons: [{
          text: this.translate.instant('OK'),
          handler: () => {
            errorAlert.dismiss().then(() => {
              this.navCtrl.pop()
            })
            return false
          }
        }]
      })
      await loader.dismiss()
      await errorAlert.present()
    }
  }

  async sweep() {
    this.canLeave = false
    await this.signAndBroadcast()
    this.canLeave = true
  }

  async signAndBroadcast() {
    let hex: string
    let loader = this.loadingCtrl.create({
      content: this.translate.instant('SIGNING')+"..."
    })
    await loader.present()
    try {
      let signedTx: any = await this.wallet.makeSweepTx(this.wif, this.wifInfo)
      hex = signedTx.hex
    } catch (err) {
      await loader.dismiss()
      console.log(err)
      let message: string
      if (err.message == 'not connected') {
        message = this.translate.instant('ERR_NOT_CONNECTED')
      } else if (err.message == 'not enough fund') {
        message = this.translate.instant('ERR_NOT_ENOUGH_FUND')
      } else {
        message = this.translate.instant('ERR_CREATE_TX_FAILED')
      }
      await this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: message,
        buttons: ['ok']
      }).present()
      return
    }
    await this.broadcast(hex, loader)
  }

  async broadcast(hex: string, loader: any) {
    try {
      loader.setContent(this.translate.instant('BROADCASTING')+'...')
      let txid: string = await this.wallet.broadcastTx(hex)
      await loader.dismiss()
      let successAlert = this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('TX_COMPLETE'),
        buttons: [{
          text: this.translate.instant('OK'),
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

}
