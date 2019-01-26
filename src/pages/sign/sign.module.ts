import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { TranslateModule } from '@ngx-translate/core';
import { ComponentsModule } from '../../components/components.module'
import { SignPage } from './sign';

@NgModule({
  declarations: [
    SignPage,
  ],
  imports: [
    IonicPageModule.forChild(SignPage),
    TranslateModule.forChild(),
    ComponentsModule
  ],
})
export class SignPageModule {}
