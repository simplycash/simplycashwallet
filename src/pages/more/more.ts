import { Component } from '@angular/core';
import { AlertController, App, IonicPage, LoadingController, NavController, NavParams } from 'ionic-angular';
import { InAppBrowser } from '@ionic-native/in-app-browser'
import { Wallet } from '../../providers/providers'


@IonicPage()
@Component({
  selector: 'page-more',
  templateUrl: 'more.html',
})
export class MorePage {

  constructor(
    public alertCtrl: AlertController,
    public app: App,
    private iab: InAppBrowser,
    public loadingCtrl: LoadingController,
    public navCtrl: NavController,
    public navParams: NavParams,
    private wallet: Wallet
  ) {

  }
  pushAddressesPage() {
    this.navCtrl.push('AddressesPage')
  }

  pushXpubPage() {
    this.navCtrl.push('XpubPage')
  }

  async showWRP() {
    this.alertCtrl.create({
      enableBackdropDismiss: false,
      title: 'Recovery Info',
      message: `recovery phrase:<br>${await this.wallet.getMnemonic()}<br><br>derivation path:<br>m/44'/145'/0'`,
      buttons: ['ok']
    }).present()
  }

  promptForMenmonic() {
    let recoverAlert = this.alertCtrl.create({
      enableBackdropDismiss: false,
      title: 'Recover Wallet',
      message: "enter the 12-word recovery phrase<br>path m/44'/145'/0' will be used",
      inputs: [{
        name: 'mnemonic',
        placeholder: 'recovery phrase'
      }],
      buttons: [{
        text: 'cancel',
        handler: data => {}
      },{
        text: 'recover',
        handler: data => {
          if (this.mnemonicIsValid(data.mnemonic)) {
            recoverAlert.dismiss().then(() => {
              this.recover(data.mnemonic)
            })
          }
          return false
        }
      }]
    })
    recoverAlert.present()
  }

  mnemonicIsValid(m: string) {
    m = m.trim()
    if (!this.wallet.validateMnemonic(m)) {
      this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: 'Error',
        message: 'invalid recovery phrase',
        buttons: ['ok']
      }).present()
      return false
    } else {
      return true
    }
  }

  recover(m: string) {
    m = m.trim()
    let error: Error
    let loader = this.loadingCtrl.create({
      content: "please wait..."
    })
    loader.present().then(() => {
      return this.wallet.recoverWalletFromMnemonic(m)
    }).then(() => {
      return this.app.getRootNav().setRoot('HomePage')
    }).catch((err: any) => {
      console.log(err)
      error = err
    }).then(() => {
      return loader.dismiss()
    }).then(() => {
      if (!error) {
        this.alertCtrl.create({
          enableBackdropDismiss: false,
          title: 'Success',
          message: 'wallet has been recovered',
          buttons: ['ok']
        }).present()
      } else {
        this.alertCtrl.create({
          enableBackdropDismiss: false,
          title: 'Error',
          message: 'failed to recover wallet',
          buttons: ['ok']
        }).present()
      }
    })
  }

  launchTwitter() {
    this.iab.create('https://twitter.com/simplycashapp', '_system')
  }

  launchTelegram() {
    this.iab.create('https://t.me/simplycashgroup', '_system')
  }

  pushSendPage() {
    this.navCtrl.push('SendPage', {
      info: { address: 'qr4ewh5fdsfn2k4extwlmkmm9wp0034k95s4rzr6xa' }
    })
  }

}
